import os, re

DOCS = '考研'

def get_title(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^#\s+(.*)', line)
            if m:
                return m.group(1).strip()
    return os.path.basename(filepath)[:-3]

def find_docs(dirpath):
    """Recursively find all .md files in a directory, return (title, abspath)."""
    results = []
    for name in sorted(os.listdir(dirpath)):
        full = os.path.join(dirpath, name)
        if name.startswith('.') or name.startswith('_'):
            continue
        if os.path.isdir(full):
            if name in ('assets',):
                continue
            results.extend(find_docs(full))
        elif name.endswith('.md') and name != 'index.md':
            title = get_title(full)
            results.append((title, full, False))
    return results

def gen_index(dirpath):
    """Generate index.md for a directory."""
    entries = find_docs(dirpath)

    # Also add subdirectories that have content but no direct .md files
    for name in sorted(os.listdir(dirpath)):
        full = os.path.join(dirpath, name)
        if name.startswith('.') or name.startswith('_'):
            continue
        if os.path.isdir(full) and name not in ('assets',):
            # Check if this subdir has any .md files
            sub_entries = find_docs(full)
            if sub_entries:
                title = name
                entries.append((f'📁 {title}', full, True))  # store absolute path

    if not entries:
        return None

    # Build hierarchical title: "笔记 > 数学 > 高数"
    rel = os.path.relpath(dirpath, DOCS).replace('\\', '/')
    parts = rel.split('/')
    if parts == ['.']:
        title = '考研笔记'
    else:
        title = ' > '.join(parts)
    lines = [f'# {title}', '']
    for title, abs_or_rel, is_dir in entries:
        # Compute link relative to dirpath (abs_or_rel is always absolute now)
        link = os.path.relpath(abs_or_rel, dirpath).replace('\\', '/')
        if is_dir:
            link += '/'
        else:
            link = link[:-3]  # remove .md
        lines.append(f'- [{title}]({link})')

    index_path = os.path.join(dirpath, 'index.md')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return index_path

# Process all directories (skip root - hand-crafted)
for root, dirs, files in os.walk(DOCS):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    if root == DOCS:
        continue  # skip root, manually maintained
    if 'index.md' not in files:
        path = gen_index(root)
        if path:
            print(f'Created: {os.path.relpath(path, DOCS)}')

print('Done.')
