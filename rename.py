import os
import re

ignore_dirs = {'.git', 'node_modules', 'dist', 'build', 'out', '.bun', '.turbo', '.next', '.husky', 'coverage'}

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

def replace_contents(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content
        
        # Replacements in order of specificity to avoid partial replacements
        replacements = [
            ('STRATACODE', 'STRATACODE'),
            ('StrataCode', 'StrataCode'),
            ('Stratacode', 'Stratacode'),
            ('stratacode', 'stratacode'),
            ('STRATA', 'STRATA'),
            ('Strata', 'Strata'),
            ('strata', 'strata')
        ]
        
        for old, new in replacements:
            content = content.replace(old, new)
            
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
    except Exception as e:
        pass
    return False

def rename_paths():
    content_modified_count = 0
    files_renamed_count = 0
    dirs_renamed_count = 0
    
    # Stage 1: Content replacements
    print("Stage 1: Content Replacements...")
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for f in files:
            filepath = os.path.join(root, f)
            if not is_binary(filepath):
                if replace_contents(filepath):
                    content_modified_count += 1
                    
    # Stage 2: File renaming (do this separately so we don't mess up content replacement iteration)
    print("Stage 2: File Renaming...")
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        for f in files:
            # We must handle case-sensitive replacements for filenames as well
            new_f = f
            new_f = new_f.replace('STRATACODE', 'STRATACODE')
            new_f = new_f.replace('StrataCode', 'StrataCode')
            new_f = new_f.replace('Stratacode', 'Stratacode')
            new_f = new_f.replace('stratacode', 'stratacode')
            new_f = new_f.replace('STRATA', 'STRATA')
            new_f = new_f.replace('Strata', 'Strata')
            new_f = new_f.replace('strata', 'strata')
            
            if new_f != f:
                old_path = os.path.join(root, f)
                new_path = os.path.join(root, new_f)
                try:
                    os.rename(old_path, new_path)
                    files_renamed_count += 1
                except Exception as e:
                    print(f"Failed to rename file {old_path} -> {new_path}: {e}")

    # Stage 3: Directory renaming
    print("Stage 3: Directory Renaming...")
    for root, dirs, files in os.walk('.', topdown=False):
        # We can't prune dirs in topdown=False effectively the same way, but it's ok, we only rename what matches
        for d in dirs:
            if d in ignore_dirs:
                continue
            
            new_d = d
            new_d = new_d.replace('STRATACODE', 'STRATACODE')
            new_d = new_d.replace('StrataCode', 'StrataCode')
            new_d = new_d.replace('Stratacode', 'Stratacode')
            new_d = new_d.replace('stratacode', 'stratacode')
            new_d = new_d.replace('STRATA', 'STRATA')
            new_d = new_d.replace('Strata', 'Strata')
            new_d = new_d.replace('strata', 'strata')
            
            if new_d != d:
                old_path = os.path.join(root, d)
                new_path = os.path.join(root, new_d)
                # Ensure we skip ignore_dirs inside hidden folders like .git
                if any(ignored in old_path.split(os.sep) for ignored in ignore_dirs):
                    continue
                try:
                    os.rename(old_path, new_path)
                    dirs_renamed_count += 1
                except Exception as e:
                    print(f"Failed to rename dir {old_path} -> {new_path}: {e}")

    print(f"Content modified in {content_modified_count} files")
    print(f"Renamed {files_renamed_count} files")
    print(f"Renamed {dirs_renamed_count} directories")

rename_paths()
