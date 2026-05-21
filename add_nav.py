import re, os, glob

# ── Auto-generate nav tree from file system ────────────────────────
def build_nav_tree(site_dir):
    """Scan site/ for .html files and build nav tree from directory structure."""
    tree = {}  # {top_level: {sub_level: {deeper: [leaf_hrefs]}}}

    for root, dirs, files in os.walk(site_dir):
        # Skip hidden dirs and special dirs
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'assets']
        for f in files:
            if not f.endswith('.html') or f == 'index.html':
                continue
            rel = os.path.relpath(os.path.join(root, f), site_dir).replace('\\', '/')
            parts = rel.split('/')
            if len(parts) >= 2:
                top = parts[0]
                # Build nested dict
                node = tree
                for part in parts[:-1]:
                    if part not in node:
                        node[part] = {}
                    node = node[part]
                if '_files' not in node:
                    node['_files'] = []
                title = parts[-1][:-5]  # remove .html
                node['_files'].append((title, rel))

    # Convert dict to NAV_TREE format
    def dict_to_tree(d, path=''):
        result = []
        # Process subdirectories first
        subdirs = sorted([k for k in d if not k.startswith('_')])
        for key in subdirs:
            subpath = f'{path}/{key}' if path else key
            entry = {'title': key, 'children': dict_to_tree(d[key], subpath)}
            # Add index link if exists
            idx_path = f'{subpath}/index.html'
            if os.path.exists(os.path.join(site_dir, idx_path)):
                entry['href'] = idx_path
            result.append(entry)
        # Add leaf files
        if '_files' in d:
            for title, href in sorted(d['_files'], key=lambda x: natural_sort_key(x[1])):
                if title not in [e['title'] for e in result]:
                    result.append({'title': title, 'href': href})
        return result

    return dict_to_tree(tree)

# ── Layout CSS ──────────────────────────────────────────────────────
SHELL_CSS = """
<style id="nav-shell-css">
:root { --header-h: 48px; --sidebar-w: 250px; --toc-w: 200px; --accent: #3f51b5; --accent-light: #e8eaf6; }
#app-shell { display: flex; flex-direction: column; height: 100vh; }
#app-shell * { box-sizing: border-box; }

.nav-header { height: var(--header-h); background: var(--accent); color: #fff; display: flex; align-items: center; padding: 0 16px; flex-shrink: 0; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.nav-header .logo { font-weight: 700; font-size: 1rem; margin-right: 20px; }
.nav-header a.tab { color: rgba(255,255,255,0.75); text-decoration: none; padding: 0 18px; font-size: 0.9rem; height: 100%; display: flex; align-items: center; border-bottom: 3px solid transparent; }
.nav-header a.tab:hover { color: #fff; background: rgba(255,255,255,0.08); }
.nav-header a.tab.active { color: #fff; border-bottom-color: #fff; font-weight: 600; }

.nav-body { display: flex; flex: 1; margin-top: var(--header-h); height: calc(100vh - var(--header-h)); }

.nav-sidebar { width: var(--sidebar-w); background: #fafafa; border-right: 1px solid #e0e0e0; overflow-y: auto; flex-shrink: 0; padding: 8px 0; }
.nav-sidebar .nav-section > a { font-weight: 600; color: #333; }
.nav-sidebar a { display: flex; align-items: center; padding: 5px 12px; color: #555; text-decoration: none; font-size: 0.85rem; border-left: 3px solid transparent; }
.nav-sidebar a:hover { background: var(--accent-light); color: #333; }
.nav-sidebar a.active { color: var(--accent); background: var(--accent-light); border-left-color: var(--accent); font-weight: 600; }
.nav-sidebar a.l2 { padding-left: 24px; font-size: 0.82rem; }
.nav-sidebar a.l3 { padding-left: 40px; font-size: 0.8rem; }
.nav-sidebar .nav-toggle { font-size: 0.6rem; margin-right: 4px; min-width: 12px; text-align: center; cursor: pointer; user-select: none; }
.nav-sidebar .nav-section.collapsed > .nav-children { display: none; }
.nav-sidebar .nav-section.collapsed > a .nav-toggle { transform: rotate(-90deg); }

.nav-content { flex: 1; overflow-y: auto; padding: 20px 28px; }
.nav-content #write { margin: 0 auto; max-width: 800px; }

.nav-toc { width: var(--toc-w); border-left: 1px solid #e0e0e0; overflow-y: auto; flex-shrink: 0; padding: 16px 12px; font-size: 0.82rem; background: #fafafa; }
.nav-toc .toc-label { font-size: 0.75rem; color: #999; font-weight: 600; margin-bottom: 8px; }
.nav-toc a { display: flex; align-items: center; color: #666; text-decoration: none; padding: 3px 0 3px 8px; border-left: 2px solid transparent; }
.nav-toc a:hover { color: var(--accent); border-left-color: var(--accent); }
.nav-toc a.toc-h4 { padding-left: 20px; font-size: 0.78rem; }
.nav-toc .toc-toggle { font-size: 0.55rem; margin-right: 4px; min-width: 10px; cursor: pointer; user-select: none; transition: transform 0.15s; }
.nav-toc .toc-section.collapsed .toc-toggle { transform: rotate(-90deg); }
.nav-toc .toc-section:not(.collapsed) .toc-toggle { transform: rotate(0deg); }
.nav-toc .toc-section.collapsed .toc-children { display: none; }

/* hide old TOC */
.content .toc, #write > .toc, .toc { display: none !important; }

.nav-hamburger { display: none; background: none; border: none; color: #fff; font-size: 1.3rem; cursor: pointer; padding: 4px 6px; margin-right: 10px; }
@media (max-width: 900px) {
  .nav-hamburger { display: block; }
  .nav-sidebar { position: fixed; top: var(--header-h); left: 0; bottom: 0; z-index: 90; transform: translateX(-100%); transition: transform 0.2s; }
  .nav-sidebar.open { transform: translateX(0); box-shadow: 2px 0 8px rgba(0,0,0,0.15); }
  .nav-toc { display: none; }
}
</style>
"""

# ── JS ───────────────────────────────────────────────────────────────
SHELL_JS = """
<script id="nav-shell-js">
document.addEventListener('DOMContentLoaded', function(){
  // Left nav toggle
  document.querySelectorAll('.nav-toggle').forEach(function(el){
    el.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      this.closest('.nav-section').classList.toggle('collapsed');
    });
  });
  // Right TOC toggle
  document.querySelectorAll('.toc-toggle').forEach(function(el){
    el.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      this.closest('.toc-section').classList.toggle('collapsed');
    });
  });
  // Mobile hamburger
  var hb = document.querySelector('.nav-hamburger');
  var sb = document.querySelector('.nav-sidebar');
  if (hb && sb) {
    hb.addEventListener('click', function(){ sb.classList.toggle('open'); });
    sb.addEventListener('click', function(e){ if (e.target.tagName === 'A') sb.classList.remove('open'); });
  }
});
</script>
"""

# ── Helpers ─────────────────────────────────────────────────────────

def natural_sort_key(name_or_href):
    """Sort key: 第1章, 第2章, ..., 第10章 in numeric order."""
    m = re.search(r'第(\d+)', name_or_href.split('/')[-1] if '/' in name_or_href else name_or_href)
    return (0, int(m.group(1))) if m else (1, name_or_href)

def make_tree(nodes, current_path, level=1):
    lines = []
    for node in nodes:
        has_children = 'children' in node and node['children']
        href = node.get('href', '#')
        title = node['title']
        is_active = (href == current_path)
        cls = 'nav-section' if has_children else 'nav-item'
        link_cls = 'l1' if level == 1 else ('l2' if level == 2 else 'l3')
        if is_active:
            link_cls += ' active'
        toggle = '<span class="nav-toggle">▼</span>' if has_children else ''
        lines.append(f'<div class="{cls}"><a class="{link_cls}" href="{href}">{toggle}{title}</a>')
        if has_children:
            lines.append('<div class="nav-children">')
            lines.extend(make_tree(node['children'], current_path, level + 1))
            lines.append('</div>')
        lines.append('</div>')
    return lines

def get_active_tab(rel_path):
    if '408' in rel_path: return '408'
    if '数学' in rel_path: return '数学'
    if '英语' in rel_path: return '英语'
    if '政治' in rel_path: return '政治'
    return ''

def extract_headings(html):
    headings = []
    for m in re.finditer(r'<(h[3-4])\s[^>]*?\bid\s*=\s*[\'"]([^\'"]+)[\'"][^>]*>(.*?)</\1>', html, re.IGNORECASE | re.DOTALL):
        level = int(m.group(1)[1])
        hid = m.group(2)
        text = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        if text:
            headings.append((level, hid, text))
    return headings

# ── Main ────────────────────────────────────────────────────────────

def add_nav(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Remove any old nav shell
    html = re.sub(r'<style id="nav-shell-css">.*?</style>', '', html, flags=re.DOTALL)
    html = re.sub(r'<script id="nav-shell-js">.*?</script>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!-- NAV_SHELL_START -->.*?<!-- NAV_SHELL_END -->', '', html, flags=re.DOTALL)
    # Remove old app-shell div (match opening to its matching close before </body>)
    html = re.sub(r'<div id="app-shell">.*?</div>\s*(?=</body>)', '', html, flags=re.DOTALL)

    rel_path = os.path.relpath(filepath, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')).replace('\\', '/')

    # Extract headings for right TOC (build hierarchical tree)
    headings = extract_headings(html)
    # Build tree: h3 items contain h4 children
    toc_tree = []
    current_h3 = None
    for level, hid, text in headings:
        if level == 3:
            current_h3 = {'hid': hid, 'text': text, 'children': []}
            toc_tree.append(current_h3)
        elif level == 4:
            if current_h3 is not None:
                current_h3['children'].append({'hid': hid, 'text': text})
            else:
                # No parent h3 — add h4 directly as top-level
                toc_tree.append({'hid': hid, 'text': text, 'children': []})

    toc_items = []
    for item in toc_tree:
        has_kids = len(item['children']) > 0
        toc_items.append(f'<div class="toc-section collapsed">')
        if has_kids:
            toc_items.append(f'<a class="toc-h3" href="#{item["hid"]}"><span class="toc-toggle">▼</span>{item["text"]}</a>')
            toc_items.append('<div class="toc-children">')
            for child in item['children']:
                toc_items.append(f'<a class="toc-h4" href="#{child["hid"]}">{child["text"]}</a>')
            toc_items.append('</div>')
        else:
            toc_items.append(f'<a class="toc-h3" href="#{item["hid"]}">{item["text"]}</a>')
        toc_items.append('</div>')
    toc_html = '<div class="toc-label">目录</div>\n' + '\n'.join(toc_items) if toc_items else ''

    # Header tabs
    active_tab = get_active_tab(rel_path)
    depth = rel_path.count('/')
    home_base = '../' * depth + 'index.html' if depth > 0 else 'index.html'

    up = '../' * depth if depth > 0 else ''
    tabs = (
        f'<a class="tab" href="{home_base}">首页</a>'
        f'<a class="tab{" active" if active_tab == "408" else ""}" href="{up}408/">408</a>'
        f'<a class="tab{" active" if active_tab == "数学" else ""}" href="{up}数学/">数学</a>'
        f'<a class="tab{" active" if active_tab == "英语" else ""}" href="{up}英语/">英语</a>'
        f'<a class="tab{" active" if active_tab == "政治" else ""}" href="{up}政治/">政治</a>'
    )

    # Left nav tree - make all hrefs relative to current page's directory
    nav_tree_auto = build_nav_tree(site_root)
    raw_tree = '\n'.join(make_tree(nav_tree_auto, rel_path))
    # Replace href="X" with page-relative path
    current_dir = os.path.dirname(rel_path)  # e.g., '数学/高数' or ''
    def make_relative(match):
        target = match.group(1)
        if target == '#' or target.startswith('http'):
            return f'href="{target}"'
        if current_dir:
            rel = os.path.relpath(target, current_dir).replace('\\', '/')
        else:
            rel = target
        return f'href="{rel}"'
    nav_tree = re.sub(r'href="([^"]+)"', make_relative, raw_tree)

    # Build shell
    shell = f"""<!-- NAV_SHELL_START -->
{SHELL_CSS}
<div id="app-shell">
<div class="nav-header">
<button class="nav-hamburger">&#9776;</button>
<span class="logo">2026考研笔记</span>
{tabs}
</div>
<div class="nav-body">
<aside class="nav-sidebar">
<div style="padding:4px 12px;font-size:0.75rem;color:#999;font-weight:600">导航</div>
{nav_tree}
</aside>
<main class="nav-content">
<!-- CONTENT -->
</main>
<aside class="nav-toc">
{toc_html}
</aside>
</div>
</div>
{SHELL_JS}
<!-- NAV_SHELL_END -->"""

    # Extract body content and insert into shell
    body_m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
    if not body_m:
        print(f'  SKIP: no body tag')
        return False

    body_content = body_m.group(1)

    # Hide old TOC inside content
    body_content = re.sub(r'<div class="toc">.*?</div>\s*', '', body_content, flags=re.DOTALL)

    shell = shell.replace('<!-- CONTENT -->', body_content)

    # Keep original head, replace body
    head_m = re.search(r'<head>(.*?)</head>', html, re.DOTALL)
    head = head_m.group(1) if head_m else '<meta charset="UTF-8">'

    result = f"""<!DOCTYPE html>
<html>
<head>
{head}
</head>
<body>
{shell}
</body>
</html>"""

    # Fix body styles that interfere
    result = result.replace('body { margin: 0px; padding: 0px; height: auto;', 'body { margin: 0; padding: 0; height: auto;')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(result)

    return True

def gen_section_index(dirpath, title, children, depth):
    """Generate an index.html for a section directory."""
    home = '../' * depth + 'index.html' if depth > 0 else 'index.html'
    up = '../' * depth if depth > 0 else ''
    index_rel = os.path.relpath(dirpath, site_root).replace('\\', '/') + '/index.html'
    if index_rel == './index.html':
        index_rel = 'index.html'

    tabs = (
        f'<a class="tab" href="{home}">首页</a>'
        f'<a class="tab{" active" if "408" in title else ""}" href="{up}408/">408</a>'
        f'<a class="tab{" active" if "数学" in title else ""}" href="{up}数学/">数学</a>'
        f'<a class="tab{" active" if "英语" in title else ""}" href="{up}英语/">英语</a>'
        f'<a class="tab{" active" if "政治" in title else ""}" href="{up}政治/">政治</a>'
    )

    nav_tree_auto = build_nav_tree(site_root)
    raw_tree = '\n'.join(make_tree(nav_tree_auto, index_rel))
    cur_dir = os.path.dirname(index_rel) if index_rel != 'index.html' else ''
    def mkrel(m):
        t = m.group(1)
        if t == '#' or t.startswith('http'): return f'href="{t}"'
        if cur_dir:
            r = os.path.relpath(t, cur_dir).replace('\\', '/')
        else:
            r = t
        return f'href="{r}"'
    nav = re.sub(r'href="([^"]+)"', mkrel, raw_tree)

    items = []
    for c in children:
        has = 'children' in c and c['children']
        href = c.get('href', '#')
        if href != '#' and not href.startswith('http') and cur_dir:
            href = os.path.relpath(href, cur_dir).replace('\\', '/')
        tg = '<span class="nav-toggle">▼</span>' if has else ''
        items.append(f'<div class="nav-section"><a class="nav-link l2" href="{href}">{tg}{c["title"]}</a></div>')

    content = f'<h1 style="font-size:1.6rem;color:#333">{title}</h1>\n<p style="color:#666">选择要查看的章节：</p>\n<div style="margin-top:16px">\n' + '\n'.join(items) + '\n</div>'

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} - 2026考研笔记</title>
</head>
<body>
{SHELL_CSS}
<div id="app-shell">
<div class="nav-header">
<button class="nav-hamburger">&#9776;</button>
<span class="logo">2026考研笔记</span>
{tabs}
</div>
<div class="nav-body">
<aside class="nav-sidebar">
<div style="padding:4px 12px;font-size:0.75rem;color:#999;font-weight:600">导航</div>
{nav}
</aside>
<main class="nav-content">
{content}
</main>
<aside class="nav-toc"></aside>
</div>
</div>
{SHELL_JS}
</body>
</html>"""

    with open(os.path.join(dirpath, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    return True

# Process
site_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
site_root = site_dir
files = glob.glob(os.path.join(site_dir, '**/*.html'), recursive=True)
files = [f for f in files if 'mkdocs' not in f and os.path.basename(f) != 'index.html']

count = 0
for f in sorted(files):
    rel = os.path.relpath(f, site_dir)
    print(f'Processing: {rel}')
    if add_nav(f):
        count += 1

# Generate section index pages for directories that contain HTML files
print('\nGenerating section index pages...')
idx_count = 0
# Find all directories under site/ that contain .html files (excluding index.html)
all_dirs = set()
for root, dirs, files in os.walk(site_dir):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'assets']
    for f in files:
        if f.endswith('.html') and f != 'index.html':
            all_dirs.add(os.path.relpath(root, site_dir).replace('\\', '/'))

# Generate index pages for intermediate directories
# e.g., if files are in '408/操作系统/笔记/', create index for '408/', '408/操作系统/', '408/操作系统/笔记/'
sections_to_generate = set()
for d in all_dirs:
    parts = d.split('/')
    for i in range(len(parts)):
        prefix = '/'.join(parts[:i+1])
        sections_to_generate.add(prefix)

# Also ensure top-level section directories always get an index
for d in os.listdir(site_dir):
    full = os.path.join(site_dir, d)
    if os.path.isdir(full) and not d.startswith('.') and d != 'assets':
        sections_to_generate.add(d)

for dirpath in sorted(sections_to_generate):
    full_dir = os.path.join(site_dir, dirpath)
    os.makedirs(full_dir, exist_ok=True)
    depth = len(dirpath.split('/'))
    title = ' > '.join(dirpath.split('/')) if '/' in dirpath else dirpath

    # Collect children (subdirectories or html files in this directory)
    children = []
    child_dir = os.path.join(site_dir, dirpath)
    if os.path.isdir(child_dir):
        # Subdirectories
        for name in sorted(os.listdir(child_dir), key=natural_sort_key):
            sub_path = os.path.join(child_dir, name)
            if os.path.isdir(sub_path) and not name.startswith('.') and name != 'assets':
                # Check if this subdir has any html files (recursively)
                has_html = False
                for r, ds, fs in os.walk(sub_path):
                    ds[:] = [d for d in ds if not d.startswith('.') and d != 'assets']
                    if any(f.endswith('.html') and f != 'index.html' for f in fs):
                        has_html = True
                        break
                if has_html:
                    children.append({'title': name, 'children': []})
            elif name.endswith('.html') and name != 'index.html':
                children.append({'title': name[:-5], 'href': f'{dirpath}/{name}'})

    gen_section_index(full_dir, title, children, depth)
    print(f'  Created: {dirpath}/index.html')
    idx_count += 1

# Generate main index page
def gen_main_index():
    # Find the first available page for each subject
    subjects = {'408': None, '数学': None, '英语': None, '政治': None}
    for root, dirs, files in os.walk(site_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'assets']
        for f in files:
            if f.endswith('.html') and f != 'index.html':
                rel = os.path.relpath(os.path.join(root, f), site_dir).replace('\\', '/')
                top = rel.split('/')[0]
                if top in subjects and subjects[top] is None:
                    subjects[top] = rel
                if all(v is not None for v in subjects.values()):
                    break
        if all(v is not None for v in subjects.values()):
            break

    content = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>2026考研笔记资料库</title>
<style>
  :root { --bg: #f0f2f5; --card-bg: #fff; --text: #333; --muted: #666; --accent: #3f51b5; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .container { text-align: center; padding: 40px 20px; }
  h1 { font-size: 2.2rem; margin-bottom: 8px; }
  .subtitle { color: var(--muted); margin-bottom: 48px; font-size: 1.1rem; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 500px; margin: 0 auto; }
  .subject-card { display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--card-bg); border: 2px solid #e0e0e0; border-radius: 16px; padding: 40px 20px; text-decoration: none; color: var(--text); transition: all 0.2s; min-height: 160px; }
  .subject-card:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(63,81,181,0.15); transform: translateY(-2px); }
  .subject-card .icon { font-size: 2.5rem; margin-bottom: 12px; }
  .subject-card .label { font-size: 1.3rem; font-weight: 700; }
  .subject-card .hint { font-size: 0.8rem; color: var(--muted); margin-top: 6px; }
  .countdown-wrap { margin: 16px 0 40px; }
  .countdown-label { font-size: 0.9rem; color: var(--muted); margin-bottom: 12px; }
  .countdown-row { display: flex; justify-content: center; gap: 12px; }
  .countdown-item { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px 14px; min-width: 72px; text-align: center; }
  .countdown-item .num { font-size: 2rem; font-weight: 700; color: #e53935; line-height: 1.2; }
  .countdown-item .unit { font-size: 0.75rem; color: #999; margin-top: 4px; }
  .footer { text-align: center; color: var(--muted); font-size: 0.85rem; margin-top: 48px; }
</style>
</head>
<body>
<div class="container">
  <h1>2026考研笔记资料库</h1>
  <p class="subtitle">11408 及公共课复习笔记</p>
  <div class="countdown-wrap">
    <p class="countdown-label">距离 2026 考研（12.20）</p>
    <div class="countdown-row" id="countdown"></div>
  </div>
  <div class="grid2">
"""

    icons = {'408': '💻', '数学': '📐', '英语': '📖', '政治': '📋'}
    for subj in ['408', '数学', '英语', '政治']:
        href = subjects[subj] or f'{subj}/'
        content += f'    <a class="subject-card" href="{href}"><span class="icon">{icons.get(subj, "")}</span><span class="label">{subj}</span></a>\n'

    content += """  </div>
  <p class="footer">Generated with Typora &middot; Hosted on GitHub Pages</p>
</div>
<script>
(function() {
  var exam = new Date(2026, 11, 20, 8, 30, 0);
  var el = document.getElementById('countdown');
  function update() {
    var diff = exam - new Date();
    if (diff <= 0) { el.innerHTML = "<p style='font-size:1.2rem;color:#e53935;font-weight:700'>考研加油！</p>"; return; }
    var days = Math.floor(diff / 86400000);
    var hrs = Math.floor((diff % 86400000) / 3600000);
    var mins = Math.floor((diff % 3600000) / 60000);
    var secs = Math.floor((diff % 60000) / 1000);
    el.innerHTML =
      '<div class="countdown-item"><div class="num">' + days + '</div><div class="unit">天</div></div>' +
      '<div class="countdown-item"><div class="num">' + hrs + '</div><div class="unit">时</div></div>' +
      '<div class="countdown-item"><div class="num">' + mins + '</div><div class="unit">分</div></div>' +
      '<div class="countdown-item"><div class="num">' + secs + '</div><div class="unit">秒</div></div>';
  }
  update();
  setInterval(update, 1000);
})();
</script>
</body>
</html>"""

    with open(os.path.join(site_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(content)
    print('  Updated: index.html')

gen_main_index()

print(f'\nDone. Added nav shell to {count} files + {idx_count} index pages.')
