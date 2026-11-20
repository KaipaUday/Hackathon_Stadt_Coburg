import argparse
from pathlib import Path

parser = argparse.ArgumentParser(
    description="Count file types in a folder and all of its subfolders."
)
parser.add_argument("folder", nargs="?", default=".", help="Folder to search")
args = parser.parse_args()

root = Path(args.folder)
if not root.is_dir():
    parser.error(f"not a folder: {root}")

file_type_counts = {}
folders_to_visit = [root]

while folders_to_visit:
    folder = folders_to_visit.pop()
    for path in folder.iterdir():
        if path.is_dir() and not path.is_symlink():
            folders_to_visit.append(path)
        elif path.is_file():
            file_type = path.suffix.lower() or "[no extension]"
            file_type_counts[file_type] = file_type_counts.get(file_type, 0) + 1

if not file_type_counts:
    print("No files found.")
else:
    print("File types found:")
    for file_type, count in sorted(file_type_counts.items()):
        print(f"{file_type}: {count}")