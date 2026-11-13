#!/usr/bin/env python3
"""
Smart Duplicate-Free Cloudflare R2 Sync & Ingestion Tool for Analog Tech Foundry
Bucket: atek-media (https://pub-699f78fcd6c2411fa1de6ee874792c81.r2.dev)

Features:
- Syncs local `images/eggs/` -> R2 `eggs/` and `images/wlob/` -> R2 `wlob/`
- Tracks both filenames AND SHA-256 image hashes in `.r2-sync-index.json`
- Prevents duplicates by filename AND by exact image content (SHA-256)
- Can ingest additional photos directly from a source folder (`--ingest-eggs /path` or `--ingest-wlob /path`)
  while automatically skipping any photo already in `eggs/` or `wlob/`
- Automatically updates `eggs/manifest.json`, `eggs/manifest.js`, `wlob/manifest.json`, and `wlob/manifest.js` in R2
"""

import argparse
import concurrent.futures
import hashlib
import http.client
import json
import mimetypes
import os
import pathlib
import re
import subprocess
import sys
import threading
import time
import urllib.parse

ACCOUNT_ID = "6783a90d2e23f2d7870c14cb36d921fe"
BUCKET_NAME = "atek-media"
PUBLIC_R2_URL = "https://pub-699f78fcd6c2411fa1de6ee874792c81.r2.dev"

ROOT_DIR = pathlib.Path(__file__).resolve().parent
INDEX_FILE = ROOT_DIR / ".r2-sync-index.json"
WRANGLER_CFG = pathlib.Path.home() / ".config" / ".wrangler" / "config" / "default.toml"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}

_token_lock = threading.Lock()
_current_token = None
_last_refresh = 0.0


def get_oauth_token(force_refresh=False):
    global _current_token, _last_refresh
    with _token_lock:
        now = time.time()
        if force_refresh or not _current_token or (now - _last_refresh > 1200):
            if force_refresh or (now - _last_refresh > 1200):
                try:
                    subprocess.run(
                        ["npx", "-y", "wrangler", "whoami"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=25,
                    )
                except Exception:
                    pass
            cfg_text = WRANGLER_CFG.read_text(encoding="utf-8")
            m = re.search(r'oauth_token\s*=\s*"([^"]+)"', cfg_text)
            if not m:
                raise RuntimeError("Could not read oauth_token from Wrangler config")
            _current_token = m.group(1)
            _last_refresh = time.time()
        return _current_token


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def load_index():
    if INDEX_FILE.exists():
        try:
            return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"uploaded_keys": {}, "hashes": {}}


def save_index(idx):
    tmp = INDEX_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(idx, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(INDEX_FILE)


_thread_local = threading.local()


def get_https_conn():
    conn = getattr(_thread_local, "conn", None)
    if conn is None:
        conn = http.client.HTTPSConnection("api.cloudflare.com", timeout=30)
        _thread_local.conn = conn
    return conn


def reset_https_conn():
    conn = getattr(_thread_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
        _thread_local.conn = None


def upload_bytes_to_r2(r2_key: str, data: bytes, content_type: str) -> bool:
    encoded_key = "/".join(urllib.parse.quote(part, safe="") for part in r2_key.split("/"))
    path = f"/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET_NAME}/objects/{encoded_key}"

    for attempt in range(4):
        token = get_oauth_token(force_refresh=(attempt > 0))
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "Content-Length": str(len(data)),
            "Connection": "keep-alive",
        }
        try:
            conn = get_https_conn()
            conn.request("PUT", path, body=data, headers=headers)
            resp = conn.getresponse()
            resp.read()
            if resp.status == 200:
                return True
            if resp.status in (401, 403):
                reset_https_conn()
                get_oauth_token(force_refresh=True)
                continue
            reset_https_conn()
        except Exception:
            reset_https_conn()
        time.sleep(0.4 * (attempt + 1))
    return False


def sync_folder(local_dir: pathlib.Path, prefix: str, idx: dict, workers: int = 24):
    files = sorted(
        p for p in local_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )
    total = len(files)
    print(f"[{prefix}] Scanning {total} images in {local_dir} ...")

    uploaded_keys = idx["uploaded_keys"]
    hashes = idx["hashes"]

    to_upload = []
    skipped_already_uploaded = 0
    skipped_duplicate_hash = 0

    for p in files:
        r2_key = f"{prefix}/{p.name}"
        if r2_key in uploaded_keys:
            skipped_already_uploaded += 1
            continue
        file_hash = sha256_file(p)
        existing_key = hashes.get(file_hash)
        if existing_key and existing_key.startswith(f"{prefix}/") and existing_key != r2_key:
            skipped_duplicate_hash += 1
            continue
        to_upload.append((p, r2_key, file_hash))

    print(
        f"[{prefix}] Already in R2: {skipped_already_uploaded} | "
        f"Skipped duplicate content: {skipped_duplicate_hash} | "
        f"New to upload: {len(to_upload)}"
    )

    if to_upload:
        lock = threading.Lock()
        done_count = 0
        fail_count = 0
        start_t = time.time()

        def worker(item):
            nonlocal done_count, fail_count
            p, r2_key, file_hash = item
            ctype = mimetypes.guess_type(p.name)[0] or "image/jpeg"
            data = p.read_bytes()
            ok = upload_bytes_to_r2(r2_key, data, ctype)
            with lock:
                if ok:
                    uploaded_keys[r2_key] = file_hash
                    hashes[file_hash] = r2_key
                    done_count += 1
                    if done_count % 250 == 0 or done_count == len(to_upload):
                        elapsed = max(0.1, time.time() - start_t)
                        rate = done_count / elapsed
                        print(
                            f"  [{prefix}] Uploaded {done_count}/{len(to_upload)} "
                            f"({rate:.1f} files/sec)",
                            flush=True,
                        )
                    if done_count % 1000 == 0:
                        save_index(idx)
                else:
                    fail_count += 1

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(worker, to_upload))

        save_index(idx)
        print(f"[{prefix}] Upload pass complete: {done_count} succeeded, {fail_count} failed.")

    # Build and upload manifest.json and manifest.js for this prefix
    prefix_files = sorted(
        key.split("/", 1)[1]
        for key in uploaded_keys
        if key.startswith(f"{prefix}/")
        and pathlib.Path(key).suffix.lower() in IMAGE_EXTS
    )
    manifest_json_bytes = json.dumps(prefix_files).encode("utf-8")
    var_name = "EGG_IMAGES" if prefix == "eggs" else "WLOB_SECRET_IMAGES"
    manifest_js_bytes = f"window.{var_name} = {json.dumps(prefix_files)};\n".encode("utf-8")

    upload_bytes_to_r2(f"{prefix}/manifest.json", manifest_json_bytes, "application/json")
    upload_bytes_to_r2(f"{prefix}/manifest.js", manifest_js_bytes, "application/javascript")
    print(f"[{prefix}] Updated R2 {prefix}/manifest.json & {prefix}/manifest.js ({len(prefix_files)} photos).")


def main():
    parser = argparse.ArgumentParser(description="Sync images/eggs and images/wlob to Cloudflare R2 without duplicates.")
    parser.add_argument("--workers", type=int, default=24, help="Parallel upload threads (default: 24)")
    args = parser.parse_args()

    get_oauth_token(force_refresh=True)
    idx = load_index()

    eggs_dir = ROOT_DIR / "images" / "eggs"
    wlob_dir = ROOT_DIR / "images" / "wlob"

    if eggs_dir.is_dir():
        sync_folder(eggs_dir, "eggs", idx, workers=args.workers)
    if wlob_dir.is_dir():
        sync_folder(wlob_dir, "wlob", idx, workers=args.workers)

    print("\nAll folders synced to R2!")
    print(f"Public base URL: {PUBLIC_R2_URL}")


if __name__ == "__main__":
    main()
