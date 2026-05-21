import re, os, glob

TOC_CSS = """
<style>
.toc {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 16px 20px;
  margin-bottom: 24px;
  font-size: 0.92rem;
}
.toc-title {
  font-weight: 700;
  font-size: 1.05rem;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
}
.toc-title::after { content: ' [收起]'; font-weight: 400; color: #888; font-size: 0.85rem; }
.toc.collapsed .toc-title::after { content: ' [展开]'; }
.toc.collapsed .toc-list { display: none; }
.toc-list { list-style: none; padding-left: 0; margin: 0; }
.toc-list li { margin: 4px 0; }
.toc-list a { text-decoration: none; color: #3f51b5; }
.toc-list a:hover { text-decoration: underline; }
.toc-h3 { padding-left: 0; }
.toc-h4 { padding-left: 20px; font-size: 0.88rem; }
</style>
"""

TOC_JS = """
<script>
document.addEventListener('DOMContentLoaded', function(){
  var t = document.querySelector('.toc-title');
  if (t) t.addEventListener('click', function(){
    document.querySelector('.toc').classList.toggle('collapsed');
  });
});
</script>
"""

def extract_headings(html):
    """Extract h1-h4 headings with ids from HTML."""
    headings = []
    # match <hN id='...'>content</hN> or <hN id="...">content</hN>
    pattern = re.compile(
        r'<(h[1-6])\s[^>]*?\bid\s*=\s*[\'"]([^\'"]+)[\'"][^>]*>(.*?)</\1>',
        re.IGNORECASE | re.DOTALL
    )
    for m in pattern.finditer(html):
        level = int(m.group(1)[1])
        hid = m.group(2)
        text = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        if text:
            headings.append((level, hid, text))
    return headings

def build_toc(headings):
    if not headings:
        return ''
    items = []
    for level, hid, text in headings:
        cls = f'toc-h{level}'
        items.append(f'<li class="{cls}"><a href="#{hid}">{text}</a></li>')
    toc_html = '<div class="toc">\n'
    toc_html += '<div class="toc-title">目录</div>\n'
    toc_html += '<ul class="toc-list">\n'
    toc_html += '\n'.join(items)
    toc_html += '\n</ul></div>'
    return toc_html

def inject_toc(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    headings = extract_headings(html)
    if not headings:
        print(f'  SKIP (no headings with id): {filepath}')
        return False

    toc = build_toc(headings)

    # Remove existing TOC (by marker comment)
    html = re.sub(r'<!-- TOC_START -->.*?<!-- TOC_END -->', '', html, flags=re.DOTALL)

    marker = '<!-- TOC_START -->' + TOC_CSS + TOC_JS + toc + '<!-- TOC_END -->'

    # Inject after <body> or after <div id="write"> (handles any attributes/quote style)
    m = re.search(r'<div\s+id=[\'\"]write[\'\"]\s*[^>]*>', html, re.IGNORECASE)
    if m:
        html = html[:m.end()] + '\n' + marker + html[m.end():]
    else:
        html = re.sub(r'(<body\s[^>]*>)', r'\1\n' + marker, html, count=1, flags=re.IGNORECASE)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)

    return True

# Process all HTML files
site_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
files = glob.glob(os.path.join(site_dir, '**/*.html'), recursive=True)
files = [f for f in files if os.path.basename(f) != 'index.html']  # skip index

count = 0
for f in sorted(files):
    rel = os.path.relpath(f, site_dir)
    print(f'Processing: {rel}')
    if inject_toc(f):
        count += 1

print(f'\nDone. Added TOC to {count} files.')
