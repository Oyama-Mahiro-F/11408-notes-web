# 搜索功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为考研笔记静态站点添加全站客户端搜索功能（bigram 中文分词 + 分科倒排索引）

**Architecture:** Python 构建时在 `add_nav.py` 中新增 `build_search_index()`，扫描所有 HTML 提取文本生成分科 JSON 索引；客户端 `search.js` 负责索引加载、bigram 匹配、排名和 UI 交互；`search-results.html` 提供完整搜索结果页。

**Tech Stack:** Python 3 (HTMLParser, json, os), 纯 JavaScript (无框架), 纯 CSS (复用现有变量)

## Global Constraints

- 纯静态站，GitHub Pages 部署，无服务端
- 复用现有 CSS 变量 `--accent: #3f51b5`, `--accent-light: #e8eaf6`
- 搜索范围：全站所有科目
- 索引按科目分文件：`search/{408,数学,英语,政治}.json`
- 构建流程集成到 `add_nav.py`，`push.py` 自动继承

---

## File Map

| File | Role |
|------|------|
| `add_nav.py` | 新增 `build_search_index()` + 注入搜索 CSS/JS 引用 + 首页搜索框 |
| `site/search.js` | 搜索核心逻辑 + UI 交互（新建） |
| `site/search-results.html` | 完整搜索结果页（新建） |
| `site/search/*.json` | 分科倒排索引（构建时生成） |
| `site/index.html` | 由 `add_nav.py` 的 `gen_main_index()` 生成，注入搜索框 |

---

### Task 1: `build_search_index()` in `add_nav.py`

**Files:**
- Modify: `add_nav.py` — 新增函数，末尾主流程中调用

**Interfaces:**
- Consumes: `site_root` (existing global), `os`, `re`, `json`, `html.parser`
- Produces: `build_search_index(site_dir)` — writes `site_dir/search/{subject}.json`

- [ ] **Step 1: Add imports at top of file**

```python
import json
from html.parser import HTMLParser
```

Insert after line 1 (`import re, os, glob`).

- [ ] **Step 2: Add `build_search_index()` function**

Insert before the `# Process` comment block (before line 489). The function scans all .html files, extracts text content, builds bigram index, and writes per-subject JSON files.

```python
# ── Search index builder ────────────────────────────────────────────

class _TextExtractor(HTMLParser):
    """Extract visible text from HTML, skipping script/style tags."""
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.skip = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip = False

    def handle_data(self, data):
        if not self.skip:
            t = data.strip()
            if t:
                self.text.append(t)


def bigram_tokenize(text):
    """Tokenize text into bigrams for Chinese + whole words for ASCII."""
    tokens = []
    # Split Chinese chars from ASCII words
    segments = re.findall(r'[\u4e00-\u9fff]+|[a-zA-Z0-9]+|\S', text)
    for seg in segments:
        if re.match(r'[\u4e00-\u9fff]', seg):
            # Chinese: sliding bigram window
            for i in range(len(seg) - 1):
                tokens.append(seg[i:i+2])
        elif re.match(r'[a-zA-Z0-9]+', seg):
            # ASCII word: keep as-is, lowercase
            tokens.append(seg.lower())
        # Single punctuation/symbol chars are skipped
    return list(set(tokens))  # deduplicate


def build_search_index(site_dir):
    """Scan site_dir for .html files, build per-subject search indices."""
    search_dir = os.path.join(site_dir, 'search')
    os.makedirs(search_dir, exist_ok=True)

    # Collect pages per subject
    subjects = {}  # {subject_name: [page_dict, ...]}
    skipped = []   # files that don't belong to any subject

    for root, dirs, files in os.walk(site_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.')
                   and not d.endswith('.assets')
                   and d != 'assets'
                   and d != 'search']
        for f in files:
            if not f.endswith('.html'):
                continue
            if f == 'index.html' and root == site_dir:
                continue  # skip root index
            filepath = os.path.join(root, f)
            rel = os.path.relpath(filepath, site_dir).replace('\\', '/')
            parts = rel.split('/')
            subject = parts[0] if len(parts) >= 1 else None

            if subject not in ('408', '数学', '英语', '政治'):
                skipped.append(rel)
                continue

            try:
                with open(filepath, 'r', encoding='utf-8') as fh:
                    html = fh.read()
            except Exception as e:
                print(f'  [search] WARNING: cannot read {rel}: {e}')
                continue

            # Extract title from <title> tag
            title_m = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
            title = title_m.group(1).strip() if title_m else f[:-5]

            # Strip " - 2026考研笔记" suffix from title
            title = re.sub(r'\s*[-–|]\s*2026考研笔记.*$', '', title)

            # Extract body text
            body_m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
            if body_m:
                extractor = _TextExtractor()
                extractor.feed(body_m.group(1))
                full_text = ' '.join(extractor.text)
            else:
                full_text = title

            # Truncate for index (keep first 500 chars for search snippet)
            snippet = full_text[:500]

            if subject not in subjects:
                subjects[subject] = []
            page_id = len(subjects[subject])
            subjects[subject].append({
                'id': page_id,
                'title': title,
                'path': rel,
                'text': snippet,
                'subject': subject,
            })

    if skipped:
        print(f'  [search] skipped {len(skipped)} files outside subject dirs')

    # Build per-subject index
    for subject, pages in subjects.items():
        # Build inverted index: bigram -> [page_ids]
        inverted = {}
        for p in pages:
            tokens = bigram_tokenize(p['title'] + ' ' + p['text'])
            for tok in tokens:
                inverted.setdefault(tok, []).append(p['id'])

        # Deduplicate page ids in each posting list
        for tok in inverted:
            inverted[tok] = sorted(set(inverted[tok]))

        # Remove id field from pages (redundant with array index)
        pages_out = [{k: v for k, v in p.items() if k != 'id'} for p in pages]

        index_file = os.path.join(search_dir, f'{subject}.json')
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump({'pages': pages_out, 'index': inverted}, f, ensure_ascii=False)

        print(f'  [search] {subject}: {len(pages_out)} pages, '
              f'{len(inverted)} unique terms -> '
              f'{os.path.basename(index_file)}')

    print(f'  [search] done — {len(subjects)} indices written')
```

- [ ] **Step 3: Call `build_search_index()` in main flow**

Find the line at the bottom of `add_nav.py`:
```python
gen_main_index()
```
Insert BEFORE it:
```python
# Build search index
print('\nBuilding search index...')
build_search_index(site_dir)
```

And also add a `.gitkeep` or ensure `search/` is not ignored. Since `.gitignore` exists, check it.

- [ ] **Step 4: Run to verify index generation**

```bash
cd D:/university_learning/site && python add_nav.py
```

Expected: 4 JSON files created in `site/search/`, each with `pages` and `index` keys. No errors.

- [ ] **Step 5: Check index content**

```bash
ls -la site/search/
python -c "import json; d=json.load(open('site/search/408.json','r',encoding='utf-8')); print(f'pages: {len(d[\"pages\"])}, terms: {len(d[\"index\"])}')"
```

- [ ] **Step 6: Commit**

```bash
git add add_nav.py site/search/
git commit -m "feat: add build_search_index() to add_nav.py — per-subject bigram JSON indices"
```

---

### Task 2: Client-side search engine — `site/search.js`

**Files:**
- Create: `site/search.js`

**Interfaces:**
- Produces: Global `SearchEngine` class
  - `new SearchEngine()` — creates engine instance
  - `engine.loadIndexes(subjects)` → `Promise<void>` — fetch + cache indexes
  - `engine.search(query)` → `[{title, path, subject, text, score}]` — ranked results
  - `engine.highlight(text, query)` → HTML string with `<mark>` tags
- Produces: Global `SearchUI` class
  - `new SearchUI(engine)` — binds to DOM elements
  - `SearchUI.initHomeSearch()` — creates search box on home page
  - `SearchUI.initNavSearch()` — creates search trigger in nav header

- [ ] **Step 1: Create `site/search.js` — core engine**

```javascript
// search.js — client-side search for 2026考研笔记
(function () {
  'use strict';

  const SUBJECTS = ['408', '数学', '英语', '政治'];
  const SUBJECT_LABELS = { '408': '408', '数学': '数学', '英语': '英语', '政治': '政治' };

  // ── Bigram tokenizer ─────────────────────────────────
  function bigramTokenize(text) {
    var tokens = [];
    var segments = text.match(/[\u4e00-\u9fff]+|[a-zA-Z0-9]+|\S/g) || [];
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (/[\u4e00-\u9fff]/.test(seg)) {
        // Chinese: sliding bigram
        for (var j = 0; j < seg.length - 1; j++) {
          tokens.push(seg.substring(j, j + 2));
        }
      } else if (/[a-zA-Z0-9]+/.test(seg)) {
        tokens.push(seg.toLowerCase());
      }
      // punctuation/single char symbols are skipped
    }
    // deduplicate
    var seen = {};
    var result = [];
    for (var k = 0; k < tokens.length; k++) {
      if (!seen[tokens[k]]) {
        seen[tokens[k]] = true;
        result.push(tokens[k]);
      }
    }
    return result;
  }

  function escapeRegex(str) {
    return str.replace(/[+?*.[\](){}^$|\\]/g, '\\$&');
  }

  // ── SearchEngine ─────────────────────────────────────
  window.SearchEngine = function () {
    this._indexes = {};       // { subject: { pages: [...], index: {...} } }
    this._loaded = false;
    this._loading = false;
    this._loadError = false;
  };

  SearchEngine.prototype.loadIndexes = function (subjectList) {
    var self = this;
    if (self._loading) return self._loadPromise;
    self._loading = true;

    var fetches = (subjectList || SUBJECTS).map(function (subj) {
      return fetch('search/' + subj + '.json')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          self._indexes[subj] = data;
          // Cache in sessionStorage
          try {
            sessionStorage.setItem('search_idx_' + subj, JSON.stringify(data));
          } catch (e) { /* quota exceeded, ignore */ }
        })
        .catch(function (err) {
          // Try sessionStorage cache as fallback
          try {
            var cached = sessionStorage.getItem('search_idx_' + subj);
            if (cached) {
              self._indexes[subj] = JSON.parse(cached);
              return;
            }
          } catch (e2) { /* ignore */ }
          self._loadError = true;
        });
    });

    self._loadPromise = Promise.all(fetches).then(function () {
      self._loaded = true;
      self._loading = false;
    }).catch(function () {
      self._loading = false;
    });

    return self._loadPromise;
  };

  SearchEngine.prototype._loadOneIndex = function (subject) {
    var self = this;
    if (self._indexes[subject]) return Promise.resolve();
    return fetch('search/' + subject + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { self._indexes[subject] = data; })
      .catch(function () {
        try {
          var cached = sessionStorage.getItem('search_idx_' + subject);
          if (cached) self._indexes[subject] = JSON.parse(cached);
        } catch (e) { /* ignore */ }
      });
  };

  SearchEngine.prototype.search = function (query) {
    var self = this;
    var tokens = bigramTokenize(query);
    if (tokens.length === 0) return [];

    var results = [];

    for (var subj in self._indexes) {
      var idx = self._indexes[subj];
      var pages = idx.pages;
      var inverted = idx.index;

      // AND semantic: intersect page id sets for all tokens
      var candidateIds = null;
      var allMiss = true;
      for (var t = 0; t < tokens.length; t++) {
        var posting = inverted[tokens[t]];
        if (posting) {
          allMiss = false;
          if (candidateIds === null) {
            candidateIds = posting.slice();
          } else {
            candidateIds = intersect(candidateIds, posting);
          }
        }
      }

      // If no intersection, fall back to OR (union)
      if (!candidateIds || candidateIds.length === 0) {
        candidateIds = [];
        var seen = {};
        for (var u = 0; u < tokens.length; u++) {
          var p = inverted[tokens[u]];
          if (p) {
            for (var v = 0; v < p.length; v++) {
              if (!seen[p[v]]) {
                seen[p[v]] = true;
                candidateIds.push(p[v]);
              }
            }
          }
        }
      }

      // Score candidates
      for (var c = 0; c < candidateIds.length; c++) {
        var pid = candidateIds[c];
        var page = pages[pid];
        var score = 0;
        var titleLower = page.title.toLowerCase();
        var textLower = page.text.toLowerCase();
        for (var k = 0; k < tokens.length; k++) {
          var tok = tokens[k];
          // Count occurrences in title (×3)
          score += countMatches(titleLower, tok) * 3;
          // Count occurrences in text (×1)
          score += countMatches(textLower, tok);
        }
        if (score > 0) {
          results.push({
            title: page.title,
            path: page.path,
            subject: page.subject,
            text: page.text,
            score: score,
          });
        }
      }
    }

    // Sort by score descending
    results.sort(function (a, b) { return b.score - a.score; });
    return results;
  };

  SearchEngine.prototype.highlight = function (text, query) {
    if (!query || !text) return escapeHTML(text);
    var tokens = bigramTokenize(query);
    if (tokens.length === 0) return escapeHTML(text);

    // Build regex from tokens, longest first to avoid partial matches
    tokens.sort(function (a, b) { return b.length - a.length; });
    var escaped = tokens.map(escapeRegex);
    var pattern = new RegExp('(' + escaped.join('|') + ')', 'gi');
    return escapeHTML(text).replace(pattern, '<mark>$1</mark>');
  };

  SearchEngine.prototype.isAvailable = function () {
    return this._loaded || Object.keys(this._indexes).length > 0;
  };

  SearchEngine.prototype.hasError = function () {
    return this._loadError && Object.keys(this._indexes).length === 0;
  };

  // ── Helpers ──────────────────────────────────────────
  function intersect(a, b) {
    var result = [];
    var i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] < b[j]) { i++; }
      else if (a[i] > b[j]) { j++; }
      else { result.push(a[i]); i++; j++; }
    }
    return result;
  }

  function countMatches(text, token) {
    var count = 0;
    var pos = 0;
    var lower = text.toLowerCase();
    var t = token.toLowerCase();
    while ((pos = lower.indexOf(t, pos)) !== -1) {
      count++;
      pos += t.length;
    }
    return count;
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
```

- [ ] **Step 2: Write — verify syntax**

```bash
node -c site/search.js
```

Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add site/search.js
git commit -m "feat: add SearchEngine class — bigram tokenizer, AND/OR search, ranking"
```

---

### Task 3: Search UI components — append to `site/search.js`

**Files:**
- Modify: `site/search.js` — append SearchUI class

**Interfaces:**
- Produces: `SearchUI` class with dropdown panel, nav trigger, home search box

- [ ] **Step 1: Append SearchUI class**

Add after the closing `})();` (re-open the IIFE):

```javascript
// ── SearchUI ───────────────────────────────────────────
(function () {
  'use strict';

  var MAX_DROPDOWN_ITEMS = 6;
  var DEBOUNCE_MS = 300;

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  window.SearchUI = function (engine) {
    this.engine = engine;
    this._dropdown = null;
    this._navInput = null;
    this._homeInput = null;
    this._debouncedSearch = debounce(this._doSearch.bind(this), DEBOUNCE_MS);
  };

  // ── Dropdown panel ───────────────────────────────────
  SearchUI.prototype._ensureDropdown = function () {
    if (this._dropdown) return this._dropdown;
    var el = document.createElement('div');
    el.className = 'search-dropdown';
    el.innerHTML = '<div class="search-dropdown-list"></div>';
    el.style.display = 'none';
    document.body.appendChild(el);
    this._dropdown = el;

    // Click outside to close
    var self = this;
    document.addEventListener('click', function (e) {
      if (!self._dropdown) return;
      if (!self._dropdown.contains(e.target) &&
          !(self._navInput && self._navInput.contains(e.target)) &&
          !(self._homeInput && self._homeInput.contains(e.target))) {
        self._closeDropdown();
      }
    });

    // Esc to close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') self._closeDropdown();
    });

    return el;
  };

  SearchUI.prototype._showDropdown = function (anchorEl, results, query) {
    var dd = this._ensureDropdown();
    var list = dd.querySelector('.search-dropdown-list');
    var self = this;

    if (results.length === 0) {
      if (query.length > 0) {
        list.innerHTML = '<div class="search-dropdown-empty">未找到匹配的笔记</div>';
      } else {
        dd.style.display = 'none';
        return;
      }
    } else {
      var html = '';
      for (var i = 0; i < Math.min(results.length, MAX_DROPDOWN_ITEMS); i++) {
        var r = results[i];
        // Build breadcrumb from path
        var parts = r.path.split('/');
        var subject = parts[0];
        var folder = parts.length > 2 ? parts.slice(1, -1).join(' > ') : '';
        var breadcrumb = (SUBJECT_LABELS[subject] || subject) + (folder ? ' > ' + folder : '');

        html += '<a class="search-dropdown-item" href="' + r.path + '">' +
          '<span class="search-dropdown-title">' + self.engine.highlight(r.title, query) + '</span>' +
          '<span class="search-dropdown-meta">' + escapeHTML(breadcrumb) + '</span>' +
          '<span class="search-dropdown-snippet">' + self.engine.highlight(r.text.substring(0, 100), query) + '</span>' +
          '</a>';
      }
      if (results.length > MAX_DROPDOWN_ITEMS) {
        html += '<a class="search-dropdown-more" href="search-results.html?q=' +
          encodeURIComponent(query) + '">查看全部 ' + results.length + ' 条结果 →</a>';
      }
      list.innerHTML = html;
    }

    // Position relative to anchor
    var rect = anchorEl.getBoundingClientRect();
    var top = rect.bottom + 4;
    var left = rect.left;
    // Clamp to viewport
    var maxW = Math.min(480, window.innerWidth * 0.9);
    if (left + maxW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - maxW - 8);
    }
    dd.style.top = top + 'px';
    dd.style.left = left + 'px';
    dd.style.maxWidth = maxW + 'px';
    dd.style.display = 'block';
  };

  SearchUI.prototype._closeDropdown = function () {
    if (this._dropdown) this._dropdown.style.display = 'none';
    if (this._navInput) {
      var input = this._navInput.querySelector('input');
      if (input) { input.value = ''; input.blur(); }
      this._navInput.classList.remove('open');
    }
    // Restore search icon visibility if nav
    var icon = document.querySelector('.nav-search-icon');
    if (icon) icon.style.display = '';
  };

  SearchUI.prototype._doSearch = function (anchorEl, query) {
    var q = (query || '').trim();
    if (!q) {
      this._closeDropdown();
      return;
    }
    if (!this.engine.isAvailable()) {
      // Still loading
      return;
    }
    var results = this.engine.search(q);
    this._showDropdown(anchorEl, results, q);
    // Also update search-results.html if on that page
    this._renderFullResults(q, results);
  };

  // ── Nav header search ────────────────────────────────
  SearchUI.prototype._createNavSearch = function () {
    var header = document.querySelector('.nav-header');
    if (!header) return;

    var self = this;

    // Create container
    var wrapper = document.createElement('div');
    wrapper.className = 'nav-search-wrap';
    wrapper.innerHTML =
      '<span class="nav-search-icon" title="搜索 (Ctrl+K)">🔍</span>' +
      '<div class="nav-search-input-wrap" style="display:none">' +
      '<input type="text" class="nav-search-input" placeholder="搜索笔记...">' +
      '</div>';
    header.appendChild(wrapper);

    var icon = wrapper.querySelector('.nav-search-icon');
    var inputWrap = wrapper.querySelector('.nav-search-input-wrap');
    var input = wrapper.querySelector('.nav-search-input');
    this._navInput = wrapper;

    // Click icon → expand
    icon.addEventListener('click', function (e) {
      e.stopPropagation();
      icon.style.display = 'none';
      inputWrap.style.display = '';
      input.focus();
      wrapper.classList.add('open');
    });

    // Input handler
    input.addEventListener('input', function () {
      self._debouncedSearch(wrapper, input.value);
    });

    // Ctrl+K shortcut
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        icon.style.display = 'none';
        inputWrap.style.display = '';
        input.focus();
        wrapper.classList.add('open');
      }
    });
  };

  // ── Home page search box ─────────────────────────────
  SearchUI.prototype._createHomeSearch = function () {
    // Only on pages with .idx-container (section index) or root index
    var container = document.querySelector('.idx-container');
    var grid = document.querySelector('.idx-grid');
    var subtitle = document.querySelector('.idx-subtitle');
    var referenceEl = grid || subtitle;
    if (!referenceEl || !referenceEl.parentNode) return;

    var self = this;
    var wrap = document.createElement('div');
    wrap.className = 'home-search-wrap';
    wrap.innerHTML =
      '<div class="home-search-box">' +
      '<span class="home-search-icon">🔍</span>' +
      '<input type="text" class="home-search-input" placeholder="搜索笔记关键词...">' +
      '</div>' +
      '<div class="search-dropdown-list" style="display:none"></div>';
    referenceEl.parentNode.insertBefore(wrap, referenceEl);

    var input = wrap.querySelector('.home-search-input');
    var dropdownList = wrap.querySelector('.search-dropdown-list');
    this._homeInput = wrap;

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (!q) {
        dropdownList.style.display = 'none';
        return;
      }
      if (!self.engine.isAvailable()) return;
      var results = self.engine.search(q);
      if (results.length === 0) {
        dropdownList.innerHTML = '<div class="search-dropdown-empty">未找到匹配的笔记</div>';
      } else {
        var html = '';
        for (var i = 0; i < Math.min(results.length, MAX_DROPDOWN_ITEMS); i++) {
          var r = results[i];
          var parts = r.path.split('/');
          var subject = parts[0];
          var folder = parts.length > 2 ? parts.slice(1, -1).join(' > ') : '';
          var breadcrumb = (SUBJECT_LABELS[subject] || subject) + (folder ? ' > ' + folder : '');
          html += '<a class="search-dropdown-item" href="' + r.path + '">' +
            '<span class="search-dropdown-title">' + self.engine.highlight(r.title, query) + '</span>' +
            '<span class="search-dropdown-meta">' + escapeHTML(breadcrumb) + '</span>' +
            '<span class="search-dropdown-snippet">' + self.engine.highlight(r.text.substring(0, 100), query) + '</span>' +
            '</a>';
        }
        if (results.length > MAX_DROPDOWN_ITEMS) {
          html += '<a class="search-dropdown-more" href="search-results.html?q=' +
            encodeURIComponent(q) + '">查看全部 ' + results.length + ' 条结果 →</a>';
        }
        dropdownList.innerHTML = html;
      }
      dropdownList.style.display = 'block';
    });

    // Click outside closes
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        dropdownList.style.display = 'none';
      }
    });
  };

  // ── Full results page support ────────────────────────
  SearchUI.prototype._renderFullResults = function (query, results) {
    var container = document.getElementById('search-results-container');
    if (!container) return;  // not on search-results page

    var html = '<p class="search-results-summary">' +
      (results.length > 0
        ? '搜索结果：<strong>' + escapeHTML(query) + '</strong> 共 ' + results.length + ' 条'
        : '未找到与 <strong>' + escapeHTML(query) + '</strong> 匹配的笔记') +
      '</p>';

    if (results.length === 0) {
      container.innerHTML = html;
      return;
    }

    var self = this;
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var parts = r.path.split('/');
      var subject = parts[0];
      var folder = parts.length > 2 ? parts.slice(1, -1).join(' > ') : '';
      var breadcrumb = (SUBJECT_LABELS[subject] || subject) + (folder ? ' > ' + folder : '');

      html += '<div class="search-result-item">' +
        '<a class="search-result-title" href="' + r.path + '">' +
        self.engine.highlight(r.title, query) + '</a>' +
        '<div class="search-result-meta">' +
        '<span class="search-result-subject">' + (SUBJECT_LABELS[subject] || subject) + '</span>' +
        '<span class="search-result-path">' + escapeHTML(breadcrumb) + '</span>' +
        '</div>' +
        '<div class="search-result-snippet">' +
        self.engine.highlight(r.text.substring(0, 200), query) +
        '</div>' +
        '</div>';
    }

    container.innerHTML = html;
  };

  // ── Init ──────────────────────────────────────────────
  SearchUI.prototype.init = function () {
    this._createNavSearch();
    this._createHomeSearch();

    // If on search-results page, check for query param
    var m = location.search.match(/[?&]q=([^&]+)/);
    if (m && document.getElementById('search-results-container')) {
      var query = decodeURIComponent(m[1]);
      var input = document.getElementById('search-page-input');
      if (input) {
        input.value = query;
        var self = this;
        setTimeout(function () {
          var results = self.engine.search(query);
          self._renderFullResults(query, results);
        }, 100);
      }
    }
  };

  // Re-expose helpers
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  if (typeof SUBJECT_LABELS === 'undefined') {
    var SUBJECT_LABELS = { '408': '408', '数学': '数学', '英语': '英语', '政治': '政治' };
  }
})();
```

- [ ] **Step 2: Check syntax**

```bash
node -c site/search.js
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add site/search.js
git commit -m "feat: add SearchUI — dropdown, nav trigger, home search box, results page"
```

---

### Task 4: Search CSS styles — append to `site/search.js` or inject via `add_nav.py`

**Files:**
- Modify: `add_nav.py` — add search CSS to `SHELL_CSS` constant

**Interfaces:**
- Consumes: existing CSS variables from SHELL_CSS
- Produces: search-related CSS classes rendered inline on every page

- [ ] **Step 1: Add search CSS to SHELL_CSS in `add_nav.py`**

In `add_nav.py`, inside the `SHELL_CSS` string, after the existing mobile `@media` block (line 99, before `</style>`), append:

```css

/* ── Search ──────────────────────────────────── */
.nav-search-wrap { display: flex; align-items: center; margin-left: auto; position: relative; }
.nav-search-icon { color: rgba(255,255,255,0.75); cursor: pointer; font-size: 1rem; padding: 4px 8px; border-radius: 4px; user-select: none; }
.nav-search-icon:hover { color: #fff; background: rgba(255,255,255,0.12); }
.nav-search-input-wrap { display: flex; align-items: center; }
.nav-search-input { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; width: 180px; outline: none; transition: width 0.2s; }
.nav-search-input:focus { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.5); width: 220px; }
.nav-search-input::placeholder { color: rgba(255,255,255,0.5); }

/* Home search */
.home-search-wrap { margin-bottom: 24px; position: relative; }
.home-search-box { display: flex; align-items: center; background: #fff; border: 2px solid #e0e0e0; border-radius: 12px; padding: 0 16px; max-width: 440px; margin: 0 auto; transition: border-color 0.2s; }
.home-search-box:focus-within { border-color: var(--accent); box-shadow: 0 2px 12px rgba(63,81,181,0.12); }
.home-search-icon { font-size: 1.1rem; margin-right: 8px; color: #999; flex-shrink: 0; }
.home-search-input { flex: 1; border: none; outline: none; font-size: 0.95rem; padding: 12px 0; color: #333; background: transparent; }
.home-search-input::placeholder { color: #aaa; }
.home-search-wrap .search-dropdown-list { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); z-index: 200; width: 100%; max-width: 440px; }

/* Dropdown panel */
.search-dropdown { position: fixed; z-index: 300; background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.15); border: 1px solid #e0e0e0; overflow: hidden; min-width: 260px; }
.search-dropdown-list { max-height: 400px; overflow-y: auto; }
.search-dropdown-item { display: block; padding: 12px 16px; text-decoration: none; color: inherit; border-bottom: 1px solid #f0f0f0; transition: background 0.1s; }
.search-dropdown-item:last-of-type { border-bottom: none; }
.search-dropdown-item:hover { background: var(--accent-light); }
.search-dropdown-title { display: block; font-weight: 600; font-size: 0.92rem; color: #222; margin-bottom: 2px; }
.search-dropdown-title mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
.search-dropdown-meta { display: block; font-size: 0.75rem; color: #999; margin-bottom: 3px; }
.search-dropdown-snippet { display: block; font-size: 0.8rem; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-dropdown-snippet mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
.search-dropdown-empty { padding: 20px 16px; text-align: center; color: #999; font-size: 0.9rem; }
.search-dropdown-more { display: block; padding: 10px 16px; text-align: center; color: var(--accent); font-size: 0.85rem; text-decoration: none; border-top: 1px solid #f0f0f0; font-weight: 500; }
.search-dropdown-more:hover { background: var(--accent-light); }

/* Results page */
.search-results-summary { text-align: center; color: #666; font-size: 0.95rem; margin-bottom: 32px; }
.search-result-item { padding: 20px 0; border-bottom: 1px solid #eee; }
.search-result-title { font-size: 1.1rem; font-weight: 600; color: var(--accent); text-decoration: none; }
.search-result-title:hover { text-decoration: underline; }
.search-result-title mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
.search-result-meta { font-size: 0.8rem; color: #999; margin: 4px 0 8px; display: flex; gap: 12px; align-items: center; }
.search-result-subject { background: var(--accent-light); color: var(--accent); padding: 1px 8px; border-radius: 8px; font-size: 0.72rem; font-weight: 500; }
.search-result-snippet { font-size: 0.88rem; color: #555; line-height: 1.6; }
.search-result-snippet mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }

@media (max-width: 600px) {
  .nav-search-input { width: 120px; }
  .nav-search-input:focus { width: 150px; }
  .search-dropdown { left: 8px !important; right: 8px !important; max-width: none !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add add_nav.py
git commit -m "feat: add search CSS to SHELL_CSS"
```

---

### Task 5: Inject `search.js` reference into all pages via `add_nav.py`

**Files:**
- Modify: `add_nav.py` — add `<script src="...">` to generated pages

**Interfaces:**
- Consumes: relative path logic already in `add_nav()`, `gen_section_index()`, `gen_main_index()`

- [ ] **Step 1: Add search.js script tag to `add_nav()`**

In `add_nav.py`, inside `add_nav()`, find the shell template where `{SHELL_JS}` is inserted (line 330). Add the search script tag right before `</body>` in the template:

Change the `shell` string near the end (the result construction around line 349-358):

```python
    result = f"""<!DOCTYPE html>
<html>
<head>
{head}
</head>
<body>
{shell}
<script src="{relative_search_js}" defer></script>
<script>
document.addEventListener('DOMContentLoaded', function(){{
  var engine = new SearchEngine();
  var ui = new SearchUI(engine);
  engine.loadIndexes().then(function(){{ ui.init(); }});
}});
</script>
</body>
</html>"""
```

But wait — we need `relative_search_js` to be correct. It's a bit tricky because the depth varies. Let me compute it:

In `add_nav()`, the variable `depth = rel_path.count('/')` already exists. I should compute `relative_search_js`:

```python
    depth = rel_path.count('/')
    relative_search_js = '../' * depth + 'search.js' if depth > 0 else 'search.js'
```

Wait, actually looking at the existing code, `depth` is already defined at line 281. And `up = '../' * depth if depth > 0 else ''` is at line 283.

I need to insert `relative_search_js` after that. Let me be more precise.

In `add_nav()`, after line 283 (`up = '../' * depth if depth > 0 else ''`), add:
```python
    search_js = '../' * depth + 'search.js' if depth > 0 else 'search.js'
```

Then modify the result template at the end of `add_nav()` to include the search script.

Actually let me re-read the exact template. In the current code, around line 350-358:

```python
    result = f"""<!DOCTYPE html>
<html>
<head>
{head}
</head>
<body>
{shell}
</body>
</html>"""
```

I need to add the search.js reference and init script inside `<body>` after `{shell}` and before `</body>`.

Let me be precise with the edit.

- [ ] **Step 1: Add `search_js` path variable in `add_nav()`**

Find line 283:
```python
    up = '../' * depth if depth > 0 else ''
```

Add after it:
```python
    search_js = '../' * depth + 'search.js' if depth > 0 else 'search.js'
```

- [ ] **Step 2: Inject search scripts into result template in `add_nav()`**

Find the result template at lines 350-358:
```python
    result = f"""<!DOCTYPE html>
<html>
<head>
{head}
</head>
<body>
{shell}
</body>
</html>"""
```

Replace with:
```python
    result = f"""<!DOCTYPE html>
<html>
<head>
{head}
</head>
<body>
{shell}
<script src="{search_js}" defer></script>
<script>
document.addEventListener('DOMContentLoaded',function(){{
 var e=new SearchEngine(),u=new SearchUI(e);
 e.loadIndexes().then(function(){{u.init();}});
}});
</script>
</body>
</html>"""
```

- [ ] **Step 3: Do the same for `gen_section_index()`**

Find the section index HTML template at lines 454-483. Add the same script block before `</body>`:

```python
    search_js = '../' * depth + 'search.js' if depth > 0 else 'search.js'

    html = f"""... (existing html variable, keep as-is)

... add before </body>:
<script src="{search_js}" defer></script>
<script>
document.addEventListener('DOMContentLoaded',function(){{
 var e=new SearchEngine(),u=new SearchUI(e);
 e.loadIndexes().then(function(){{u.init();}});
}});
</script>
```

Wait, I need to be more precise. Let me re-read gen_section_index to see its HTML template.

Looking at lines 454-483:
```python
    html = f"""<!DOCTYPE html>
<html>
<head>
...
</head>
<body>
...
{SHELL_JS}
</body>
</html>"""
```

I need to change the closing `</body>` part. The template ends with:
```python
	{SHELL_JS}
	</body>
	</html>"""
```

Replace with:
```python
	{SHELL_JS}
	<script src="{search_js}" defer></script>
	<script>
	document.addEventListener('DOMContentLoaded',function(){{
	 var e=new SearchEngine(),u=new SearchUI(e);
	 e.loadIndexes().then(function(){{u.init();}});
	}});
	</script>
	</body>
	</html>"""
```

But wait — `search_js` needs to be computed. `depth` is already available in `gen_section_index()` as a parameter. I need to add `search_js` computation there too.

In `gen_section_index(dirpath, title, children, depth)`, `depth` is a parameter. So I can compute `search_js` like:
```python
    search_js = '../' * depth + 'search.js' if depth > 0 else 'search.js'
```

- [ ] **Step 4: Do the same for `gen_main_index()`**

In `gen_main_index()`, which generates `site/index.html` (depth = 0), the search.js path is simply `search.js`:

Find the `</body>` tag toward the end of the generated content. Add the search scripts before `</body>`.

Actually wait — the main index page is the root `index.html`, and `search.js` is at `site/search.js`. So the path should be `search.js` (no `../` needed since it's at root level).

- [ ] **Step 5: Run add_nav.py to verify**

```bash
cd D:/university_learning/site && python add_nav.py
```

Check one generated file for the search.js injection:
```bash
grep -l "search.js" site/408/index.html site/数学/高数/*.html 2>/dev/null | head -3
```

- [ ] **Step 6: Commit**

```bash
git add add_nav.py
git commit -m "feat: inject search.js + init into all generated pages"
```

---

### Task 6: Create `site/search-results.html`

**Files:**
- Create: `site/search-results.html`

**Interfaces:**
- Consumes: Query param `?q=...` from URL
- Uses: `SearchEngine` + `SearchUI` from `search.js`

- [ ] **Step 1: Create search-results.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>搜索 - 2026考研笔记</title>
<style>
:root { --header-h: 48px; --accent: #3f51b5; --accent-light: #e8eaf6; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Helvetica Neue", Helvetica, Arial, "Microsoft YaHei", sans-serif; background: #f0f2f5; color: #333; }

.nav-header { height: var(--header-h); background: var(--accent); color: #fff; display: flex; align-items: center; padding: 0 16px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.nav-header .logo { font-weight: 700; font-size: 1rem; margin-right: 20px; text-decoration: none; color: #fff; }
.nav-header a.tab { color: rgba(255,255,255,0.75); text-decoration: none; padding: 0 18px; font-size: 0.9rem; height: 100%; display: flex; align-items: center; border-bottom: 3px solid transparent; }
.nav-header a.tab:hover { color: #fff; background: rgba(255,255,255,0.08); }
.nav-header a.tab.active { color: #fff; border-bottom-color: #fff; font-weight: 600; }

/* ── Search bar ─────────────────────────────── */
.search-page-wrap { max-width: 700px; margin: 80px auto 0; padding: 20px 24px; }
.search-page-bar { display: flex; align-items: center; background: #fff; border: 2px solid #e0e0e0; border-radius: 12px; padding: 0 16px; transition: border-color 0.2s; }
.search-page-bar:focus-within { border-color: var(--accent); box-shadow: 0 2px 12px rgba(63,81,181,0.12); }
.search-page-bar .icon { font-size: 1.1rem; margin-right: 8px; color: #999; flex-shrink: 0; }
.search-page-bar input { flex: 1; border: none; outline: none; font-size: 1rem; padding: 14px 0; color: #333; background: transparent; }
.search-page-bar input::placeholder { color: #aaa; }

/* ── Results ────────────────────────────────── */
#search-results-container { max-width: 700px; margin: 0 auto; padding: 0 24px 40px; }
.search-results-summary { text-align: center; color: #666; font-size: 0.95rem; margin-bottom: 28px; }
.search-result-item { padding: 20px 0; border-bottom: 1px solid #e8e8e8; }
.search-result-title { font-size: 1.1rem; font-weight: 600; color: var(--accent); text-decoration: none; line-height: 1.4; }
.search-result-title:hover { text-decoration: underline; }
.search-result-title mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
.search-result-meta { font-size: 0.8rem; color: #999; margin: 4px 0 8px; display: flex; gap: 12px; align-items: center; }
.search-result-subject { background: var(--accent-light); color: var(--accent); padding: 1px 8px; border-radius: 8px; font-size: 0.72rem; font-weight: 500; }
.search-result-snippet { font-size: 0.88rem; color: #555; line-height: 1.6; }
.search-result-snippet mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }

/* ── Search dropdown (copied for standalone use) ── */
.nav-search-wrap { display: flex; align-items: center; margin-left: auto; position: relative; }
.nav-search-icon { color: rgba(255,255,255,0.75); cursor: pointer; font-size: 1rem; padding: 4px 8px; border-radius: 4px; user-select: none; }
.nav-search-icon:hover { color: #fff; background: rgba(255,255,255,0.12); }
.nav-search-input-wrap { display: flex; align-items: center; }
.nav-search-input { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; width: 180px; outline: none; transition: width 0.2s; }
.nav-search-input:focus { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.5); width: 220px; }
.nav-search-input::placeholder { color: rgba(255,255,255,0.5); }

.search-dropdown { position: fixed; z-index: 300; background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.15); border: 1px solid #e0e0e0; overflow: hidden; min-width: 260px; }
.search-dropdown-list { max-height: 400px; overflow-y: auto; }
.search-dropdown-item { display: block; padding: 12px 16px; text-decoration: none; color: inherit; border-bottom: 1px solid #f0f0f0; transition: background 0.1s; }
.search-dropdown-item:last-of-type { border-bottom: none; }
.search-dropdown-item:hover { background: var(--accent-light); }
.search-dropdown-title { display: block; font-weight: 600; font-size: 0.92rem; color: #222; margin-bottom: 2px; }
.search-dropdown-title mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
.search-dropdown-meta { display: block; font-size: 0.75rem; color: #999; margin-bottom: 3px; }
.search-dropdown-snippet { display: block; font-size: 0.8rem; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-dropdown-snippet mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
.search-dropdown-empty { padding: 20px 16px; text-align: center; color: #999; font-size: 0.9rem; }
.search-dropdown-more { display: block; padding: 10px 16px; text-align: center; color: var(--accent); font-size: 0.85rem; text-decoration: none; border-top: 1px solid #f0f0f0; font-weight: 500; }
.search-dropdown-more:hover { background: var(--accent-light); }

@media (max-width: 600px) {
  .nav-search-input { width: 120px; }
  .nav-search-input:focus { width: 150px; }
  .nav-header a.tab { padding: 0 10px; font-size: 0.8rem; }
  .nav-header .logo { font-size: 0.85rem; margin-right: 8px; }
  .search-page-wrap { padding: 16px; }
}
</style>
</head>
<body>

<div id="app-shell">
<div class="nav-header">
  <a class="logo" href="index.html">2026考研笔记</a>
  <a class="tab" href="index.html">首页</a>
  <a class="tab" href="408/">408</a>
  <a class="tab" href="数学/">数学</a>
  <a class="tab" href="英语/">英语</a>
  <a class="tab" href="政治/">政治</a>
</div>

<div class="search-page-wrap">
  <div class="search-page-bar">
    <span class="icon">🔍</span>
    <input type="text" id="search-page-input" placeholder="搜索笔记关键词..." autofocus>
  </div>
</div>

<div id="search-results-container"></div>
</div>

<script src="search.js" defer></script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var engine = new SearchEngine();
  var ui = new SearchUI(engine);

  engine.loadIndexes().then(function () {
    ui.init();

    // Bind the page input
    var input = document.getElementById('search-page-input');
    if (input) {
      var debounceTimer;
      input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        var q = input.value.trim();
        debounceTimer = setTimeout(function () {
          if (q) {
            var results = engine.search(q);
            ui._renderFullResults(q, results);
          } else {
            document.getElementById('search-results-container').innerHTML = '';
          }
          // Update URL without reload
          var url = new URL(location);
          url.searchParams.set('q', q);
          history.replaceState(null, '', url);
        }, 300);
      });
    }

    // Handle initial query from URL
    var m = location.search.match(/[?&]q=([^&]+)/);
    if (m && input) {
      var query = decodeURIComponent(m[1]);
      input.value = query;
      var results = engine.search(query);
      if (ui._renderFullResults) {
        ui._renderFullResults(query, results);
      }
    }
  });
});
</script>

</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add site/search-results.html
git commit -m "feat: add search-results.html — full-page search results"
```

---

### Task 7: Main index page — add home search box

**Files:**
- Modify: `add_nav.py` — `gen_main_index()` function

**Interfaces:**
- Produces: search box HTML between countdown and subject cards in `index.html`

- [ ] **Step 1: Add search box to `gen_main_index()`**

Find the main index content between the countdown `<div>` and the grid `<div>` (around lines 610-611 in current code).

Between:
```html
  </div>
  <div class="grid2">
```

Insert the search box:
```html
  </div>
  <div class="home-search-wrap">
    <div class="home-search-box">
      <span class="home-search-icon">🔍</span>
      <input type="text" class="home-search-input" placeholder="搜索笔记关键词...">
    </div>
    <div class="search-dropdown-list" style="display:none"></div>
  </div>
  <div class="grid2">
```

- [ ] **Step 2: Add search CSS for home page to gen_main_index()**

In the inline `<style>` block of `gen_main_index()`, add the home search styles (same as in `SHELL_CSS`). Add before `</style>`:

```css
  .home-search-wrap { margin-bottom: 32px; position: relative; }
  .home-search-box { display: flex; align-items: center; background: #fff; border: 2px solid #e0e0e0; border-radius: 12px; padding: 0 16px; max-width: 440px; margin: 0 auto; transition: border-color 0.2s; }
  .home-search-box:focus-within { border-color: var(--accent); box-shadow: 0 2px 12px rgba(63,81,181,0.12); }
  .home-search-icon { font-size: 1.1rem; margin-right: 8px; color: #999; flex-shrink: 0; }
  .home-search-input { flex: 1; border: none; outline: none; font-size: 0.95rem; padding: 12px 0; color: #333; background: transparent; }
  .home-search-input::placeholder { color: #aaa; }
  .home-search-wrap .search-dropdown-list { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); z-index: 200; width: 100%; max-width: 440px; background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.15); border: 1px solid #e0e0e0; overflow: hidden; }
  .search-dropdown-item { display: block; padding: 12px 16px; text-decoration: none; color: inherit; border-bottom: 1px solid #f0f0f0; transition: background 0.1s; text-align: left; }
  .search-dropdown-item:last-of-type { border-bottom: none; }
  .search-dropdown-item:hover { background: var(--accent-light); }
  .search-dropdown-title { display: block; font-weight: 600; font-size: 0.92rem; color: #222; margin-bottom: 2px; }
  .search-dropdown-title mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
  .search-dropdown-meta { display: block; font-size: 0.75rem; color: #999; margin-bottom: 3px; }
  .search-dropdown-snippet { display: block; font-size: 0.8rem; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-dropdown-snippet mark { background: #fff3b0; color: #333; padding: 1px 2px; border-radius: 2px; }
  .search-dropdown-empty { padding: 20px 16px; text-align: center; color: #999; font-size: 0.9rem; }
  .search-dropdown-more { display: block; padding: 10px 16px; text-align: center; color: var(--accent); font-size: 0.85rem; text-decoration: none; border-top: 1px solid #f0f0f0; font-weight: 500; }
  .search-dropdown-more:hover { background: var(--accent-light); }
```

- [ ] **Step 3: Add search.js init to main index**

In `gen_main_index()`, find the closing `</body>` tag and add before it:

```html
<script src="search.js" defer></script>
<script>
document.addEventListener('DOMContentLoaded',function(){
 var e=new SearchEngine(),u=new SearchUI(e);
 e.loadIndexes().then(function(){u.init();});
});
</script>
```

- [ ] **Step 4: Run to verify**

```bash
cd D:/university_learning/site && python add_nav.py
```

Open `site/index.html` in browser and verify the search box renders between countdown and cards.

- [ ] **Step 5: Commit**

```bash
git add add_nav.py
git commit -m "feat: add home search box to main index page"
```

---

### Task 8: End-to-end integration test

- [ ] **Step 1: Full build cycle**

```bash
cd D:/university_learning/site && python add_nav.py
```

Expected: no errors, indices generated, all HTML files processed.

- [ ] **Step 2: Verify index files exist**

```bash
ls -la site/search/
```

Expected: 4 JSON files (`408.json`, `数学.json`, `英语.json`, `政治.json`).

- [ ] **Step 3: Verify index content is valid JSON with pages**

```bash
python -c "
import json, os
site = 'D:/university_learning/site'
for f in ['408.json','数学.json','英语.json','政治.json']:
    path = os.path.join(site, 'search', f)
    if os.path.exists(path):
        d = json.load(open(path, 'r', encoding='utf-8'))
        print(f'{f}: {len(d[\"pages\"])} pages, {len(d[\"index\"])} terms')
    else:
        print(f'{f}: MISSING')
"
```

- [ ] **Step 4: Spot-check one content page for search.js injection**

```bash
grep "search.js" site/408/操作系统/笔记/第1章\ 计算机系统概述.html
```

Expected: `<script src="../../../search.js" defer></script>` (3 levels deep from root)

- [ ] **Step 5: Verify search-results.html exists and is valid**

```bash
grep "search-results-container" site/search-results.html
```

Expected: match found.

- [ ] **Step 6: Verify main index has search box**

```bash
grep "home-search-box" site/index.html
```

Expected: match found.

- [ ] **Step 7: Simple Python integration test**

```bash
python -c "
import sys; sys.path.insert(0, '.')
from add_nav import build_search_index, bigram_tokenize

# Test bigram tokenizer
tokens = bigram_tokenize('操作系统概述')
assert '操作' in tokens, 'bigram 操作 missing'
assert '系统' in tokens, 'bigram 系统 missing'
assert '统概' in tokens, 'bigram 统概 missing'
print('bigram_tokenize: OK')

# Test English tokenization
tokens = bigram_tokenize('hello CPU world')
assert 'hello' in tokens, 'word hello missing'
assert 'cpu' in tokens, 'word cpu missing'
print('English tokenization: OK')
print('All tests passed.')
"
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: end-to-end integration test — indices, injections, search-results page"
```

---

## Implementation Order

Tasks must be done sequentially (each depends on the prior):

1. **Task 1** — Python index builder
2. **Task 2** — SearchEngine JS core
3. **Task 3** — SearchUI JS components
4. **Task 4** — Search CSS
5. **Task 5** — Inject search.js into pages
6. **Task 6** — search-results.html
7. **Task 7** — Main index search box
8. **Task 8** — Integration test

---

## Verification

After all tasks complete:
1. Run `python add_nav.py` — all pages regenerated, indices built
2. Open `site/index.html` in browser — search box visible, typing shows dropdown results
3. Click any result — navigates to correct page
4. Press `Ctrl+K` on any content page — nav search expands
5. Click "查看全部" — navigates to `search-results.html?q=...` with full results
6. Test on mobile viewport — dropdown within screen bounds
7. Test no-match query — shows "未找到匹配的笔记"
