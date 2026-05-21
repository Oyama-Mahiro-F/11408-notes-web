import re, os, glob

# ── Site navigation tree ───────────────────────────────────────────
NAV_TREE = [
    {'title': '408', 'children': [
        {'title': '操作系统', 'children': [
            {'title': '第1章 计算机系统概述', 'href': 'mkdocs/408/操作系统/笔记/第1章 计算机系统概述/'},
        ]},
        {'title': '数据结构', 'children': [
            {'title': '作业', 'href': 'mkdocs/408/数据结构/作业/'},
            {'title': '第1章 绪论', 'href': 'mkdocs/408/数据结构/笔记/第1章_绪论/'},
            {'title': '第2章 线性表', 'href': 'mkdocs/408/数据结构/笔记/第2章 线性表/'},
        ]},
        {'title': '计算机组成原理', 'children': [
            {'title': '第1章 计算机系统概述', 'href': 'mkdocs/408/计算机组成原理/笔记/第1章_计算机系统概述/'},
            {'title': '第2章 数据的表示和计算', 'href': 'mkdocs/408/计算机组成原理/笔记/第2章 数据的表示和计算/'},
        ]},
        {'title': '计算机网络', 'children': [
            {'title': '第1章 计算机网络体系结构', 'href': 'mkdocs/408/计算机网络/笔记/第1章 计算机网络体系结构/'},
            {'title': '第2章 物理层', 'href': 'mkdocs/408/计算机网络/笔记/第2章 物理层/'},
        ]},
    ]},
    {'title': '数学', 'children': [
        {'title': '高数', 'children': [
            {'title': '第1章 函数的极限与连续', 'href': '数学/高数/第1章 函数的极限与连续.html'},
            {'title': '第2章 一元函数微分学', 'href': '数学/高数/第2章 一元函数微分学.html'},
            {'title': '第4章 定积分', 'href': '数学/高数/第4章 定积分.html'},
            {'title': '第5章 微分方程', 'href': '数学/高数/第5章 微分方程.html'},
            {'title': '第6章 向量代数与空间解析几何', 'href': '数学/高数/第6章 向量代数与空间解析几何.html'},
            {'title': '第7章 多元函数微分学', 'href': '数学/高数/第7章 多元函数微分学.html'},
            {'title': '第8章 二重积分', 'href': '数学/高数/第8章 二重积分.html'},
            {'title': '第9章 三重积分', 'href': '数学/高数/第9章 三重积分.html'},
            {'title': '第10章 无穷级数', 'href': '数学/高数/第10章 无穷级数.html'},
            {'title': '第11章 曲线积分', 'href': '数学/高数/第11章 曲线积分.html'},
            {'title': '第12章 曲面积分', 'href': '数学/高数/第12章 曲面积分.html'},
            {'title': '公式总结', 'href': '数学/高数/公式总结.html'},
        ]},
        {'title': '线性代数', 'children': [
            {'title': '第1章 行列式', 'href': '数学/线性代数/第1章 行列式.html'},
            {'title': '第2章 矩阵', 'href': '数学/线性代数/第2章 矩阵.html'},
            {'title': '第3章 向量', 'href': '数学/线性代数/第3章 向量.html'},
            {'title': '第4章 线性方程组', 'href': '数学/线性代数/第4章 线性方程组.html'},
            {'title': '第5章 矩阵的特征值和特征向量', 'href': '数学/线性代数/第5章 矩阵的特征值和特征向量.html'},
        ]},
        {'title': '概率与统计', 'children': [
            {'title': '第1章 随机事件和概率', 'href': 'mkdocs/数学/概率与统计/第1章 随机事件和概率/'},
            {'title': '第2章 三大概型', 'href': 'mkdocs/数学/概率与统计/第2章 三大概型/'},
        ]},
    ]},
    {'title': '英语', 'children': [
        {'title': '单词', 'href': 'mkdocs/英语/单词/'},
    ]},
    {'title': '政治', 'children': []},
]

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
.nav-toc a { display: block; color: #666; text-decoration: none; padding: 3px 0 3px 8px; border-left: 2px solid transparent; }
.nav-toc a:hover { color: var(--accent); border-left-color: var(--accent); }
.nav-toc a.toc-h4 { padding-left: 20px; font-size: 0.78rem; }

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
  document.querySelectorAll('.nav-toggle').forEach(function(el){
    el.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      this.closest('.nav-section').classList.toggle('collapsed');
    });
  });
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

    # Remove any old shell
    html = re.sub(r'<style id="nav-shell-css">.*?</style>', '', html, flags=re.DOTALL)
    html = re.sub(r'<script id="nav-shell-js">.*?</script>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!-- NAV_SHELL --.*?-- NAV_SHELL_END -->', '', html, flags=re.DOTALL)
    html = re.sub(r'<div id="app-shell">.*?</div>\s*</body>', '</body>', html, flags=re.DOTALL)

    rel_path = os.path.relpath(filepath, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')).replace('\\', '/')

    # Extract headings for right TOC
    headings = extract_headings(html)
    toc_items = []
    for level, hid, text in headings:
        cls = 'toc-h3' if level == 3 else 'toc-h4'
        toc_items.append(f'<a class="{cls}" href="#{hid}">{text}</a>')
    toc_html = '<div class="toc-label">目录</div>\n' + '\n'.join(toc_items) if toc_items else ''

    # Header tabs
    active_tab = get_active_tab(rel_path)
    depth = rel_path.count('/')
    mkdocs_base = '../' * depth + 'mkdocs/' if depth > 0 else 'mkdocs/'

    tabs = []
    for t in ['408', '数学', '英语', '政治']:
        ac = ' active' if t == active_tab else ''
        href = mkdocs_base + (f'{t}/' if t != '政治' else '')
        tabs.append(f'<a class="tab{ac}" href="{href}">{t}</a>')

    # Left nav tree
    nav_tree = '\n'.join(make_tree(NAV_TREE, rel_path))

    # Build shell
    shell = f"""<!-- NAV_SHELL_START -->
{SHELL_CSS}
<div id="app-shell">
<div class="nav-header">
<button class="nav-hamburger">&#9776;</button>
<span class="logo">2026考研笔记</span>
{' '.join(tabs)}
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

# Process
site_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
files = glob.glob(os.path.join(site_dir, '**/*.html'), recursive=True)
files = [f for f in files if 'mkdocs' not in f and os.path.basename(f) != 'index.html']

count = 0
for f in sorted(files):
    rel = os.path.relpath(f, site_dir)
    print(f'Processing: {rel}')
    if add_nav(f):
        count += 1

print(f'\nDone. Added nav shell to {count} files.')
