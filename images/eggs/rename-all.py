import os

print("Starting safe, single-threaded batch rename...")

# Run this from the root of the directory tree
for root, _, files in os.walk("."):
    if root == ".":
        continue

    # Extract subfolder name, format with hyphens
    folder = os.path.basename(root).replace(" ", "-")
    
    # Catch all common image formats, sorted to maintain order
    images = sorted([f for f in files if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))])

    if not images:
        continue

    print(f"\nProcessing {len(images)} files in: {folder}")

    for i, f in enumerate(images, 1):
        ext = os.path.splitext(f)[1].lower()
        old = os.path.join(root, f)
        new = os.path.join(root, f"{folder}-{i:03d}{ext}")

        if old != new:
            # Prevent overwriting existing files
            if not os.path.exists(new):
                os.rename(old, new)
                print(f"  [SUCCESS] {f} -> {os.path.basename(new)}")
            else:
                print(f"  [SKIPPED] Target already exists: {os.path.basename(new)}")

print("\nBatch rename complete.")