import os, re

DOCS = '考研'

def get_title(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^#\s+(.*)', line)
            if m:
                return m.group(1).strip()
    return os.path.basename(filepath)[:-3]

def scan_dir(dirpath):
    """Return (md_files, subdirs) for a directory."""
    md_files = []
    subdirs = []
    exclude = {'assets', '.claude', '.stfolder'}

    for name in sorted(os.listdir(dirpath)):
        full = os.path.join(dirpath, name)
        if name.startswith('.') or name.startswith('_'):
            continue
        if os.path.isdir(full):
            if name not in exclude and not name.startswith('【'):
                subdirs.append((name, full))
        elif name.endswith('.md'):
            md_files.append((name, full))

    return md_files, subdirs

def build_nav(dirpath):
    """Build nav entries for a directory. Returns list of YAML lines."""
    md_files, subdirs = scan_dir(dirpath)
    lines = []

    for name, full in md_files:
        if name == 'index.md':
            continue
        rel = os.path.relpath(full, DOCS).replace('\\', '/')
        rel = rel[:-3]  # remove .md
        title = get_title(full)
        lines.append({'title': title, 'path': rel})

    for subname, subfull in subdirs:
        children = build_nav(subfull)
        if not children:
            continue

        # Check if this dir has an index.md
        idx = os.path.join(subfull, 'index.md')
        idx_path = os.path.relpath(idx, DOCS).replace('\\', '/')[:-3] if os.path.exists(idx) else None

        # Flatten: if children is a single "笔记" subdir, take its children
        if len(children) == 1 and subname == '笔记':
            # Merge children directly (skip "笔记" level)
            lines.extend(children)
        else:
            entry = {'title': subname, 'children': children}
            if idx_path:
                entry['index_path'] = idx_path
            lines.append(entry)

    return lines

def format_nav(entries, indent=0):
    """Format nav entries as YAML lines for mkdocs.yml."""
    lines = []
    prefix = '  ' * indent
    for e in entries:
        if 'path' in e and 'children' not in e:
            lines.append(f"{prefix}- '{e['title']}': '{e['path']}'")
        elif 'children' in e:
            title = e['title']
            lines.append(f"{prefix}- '{title}':")
            children = e['children']
            # If section has an index page, add it as first child
            if 'index_path' in e:
                lines.append(f"{prefix}  - '概述': '{e['index_path']}'")
            lines.extend(format_nav(children, indent + 1))
    return lines

def flatten_notes(entries):
    """Post-process: flatten '笔记' sub-sections, merging their children up."""
    i = 0
    while i < len(entries):
        e = entries[i]
        if 'children' in e and e['title'] == '笔记':
            # Replace this entry with its children
            entries[i:i+1] = e['children']
            i += len(e['children'])
            continue
        if 'children' in e:
            flatten_notes(e['children'])
        i += 1

entries = build_nav(DOCS)
flatten_notes(entries)
nav_yaml = '\n'.join(format_nav(entries))

# Read existing mkdocs.yml and replace nav section
with open('mkdocs.yml', 'r', encoding='utf-8') as f:
    config = f.read()

# Remove any existing nav section
config = re.sub(r'\n*^nav:.*?(\n(?=\S)|$)', '', config, flags=re.DOTALL | re.MULTILINE)
config = config.rstrip()

# Append new nav
config += '\n\nnav:\n' + nav_yaml + '\n'

with open('mkdocs.yml', 'w', encoding='utf-8') as f:
    f.write(config)

print('nav:\n' + nav_yaml)
print('\nWritten to mkdocs.yml')
