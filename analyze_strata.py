import os
import re

ignore_dirs = {'.git', 'node_modules', 'dist', 'build', 'out', '.bun', '.turbo'}

def is_binary(filepath):
    try:
        if os.path.islink(filepath) and not os.path.exists(filepath):
            return True
        with open(filepath, 'tr') as check_file:
            check_file.read(1024)
            return False
    except UnicodeDecodeError:
        return True
    except Exception:
        return True

def count_occurrences():
    dir_renames = []
    file_renames = []
    content_matches = 0
    matched_files = set()

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for d in dirs:
            if 'strata' in d.lower():
                dir_renames.append(os.path.join(root, d))
                
        for f in files:
            if 'strata' in f.lower():
                file_renames.append(os.path.join(root, f))
                
            filepath = os.path.join(root, f)
            if not is_binary(filepath):
                try:
                    with open(filepath, 'r', encoding='utf-8') as file:
                        content = file.read()
                        matches = len(re.findall(r'strata', content, re.IGNORECASE))
                        if matches > 0:
                            content_matches += matches
                            matched_files.add(filepath)
                except Exception as e:
                    pass

    print(f"Directories to rename: {len(dir_renames)}")
    print(f"Files to rename: {len(file_renames)}")
    print(f"Files to modify: {len(matched_files)}")
    print(f"Total content replacements: {content_matches}")

count_occurrences()
