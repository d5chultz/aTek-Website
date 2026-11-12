#!/bin/sh
# ==============================================================================
# ANALOG TECH FOUNDRY — WLOB PHOTO MANIFEST GENERATOR
# Regenerates images/eggs/manifest.js and images/eggs/manifest.json.
# Run this script whenever you add, remove, or deduplicate photos in images/eggs/.
# Usage:
#   ./update-eggs.sh
# Dont forget to push the changes to git-hub:
#
#  "Updated image registry and photos"
#  git push
#git add .
#  git commit -m 
# ==============================================================================
cd "$(dirname "$0")" || exit 1
python3 - <<'PY'
import os, json, shutil

targets = ['images/eggs']
desktop_target = '/home/david/Desktop/aTek Website/images/eggs'
if os.path.isdir(desktop_target):
    targets.append(desktop_target)

exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif')

for d in targets:
    if not os.path.isdir(d):
        continue
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(exts))
    js_content = 'window.EGG_IMAGES = ' + json.dumps(files, ensure_ascii=False, indent=1) + ';\n'
    json_content = json.dumps(files, ensure_ascii=False, indent=1) + '\n'
    
    with open(os.path.join(d, 'manifest.js'), 'w', encoding='utf-8') as f:
        f.write(js_content)
    with open(os.path.join(d, 'manifest.json'), 'w', encoding='utf-8') as f:
        f.write(json_content)
        
    print(f"✅ {len(files)} images registered in {d}/manifest.js and manifest.json")
PY
