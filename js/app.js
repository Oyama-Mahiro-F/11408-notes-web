/* site2 — 前端主逻辑：路由 + 目录树 + md 渲染管线 + TOC + 首页 */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var content = $('#content'), treeEl = $('#tree'), tocEl = $('#toc'),
      tocList = $('#toc-list'), tabsEl = $('#tabs'), sidebar = $('#sidebar'),
      mask = $('#sidebar-mask');

  var manifest = null;
  var expanded = {};          // 目录树展开状态: key(path prefix) -> true
  var currentPath = null;
  var spyHeadings = [];

  /* ================= 工具 ================= */
  function enc(path) { return path.split('/').map(encodeURIComponent).join('/'); }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ================= markdown 渲染管线 =================
     核心：先摘走代码块与公式（占位符），再交给 marked，最后还原并渲染 KaTeX。
     这样矩阵里的 \\ 、_ 、& 和表格里的 | 都不会被 markdown 解析器破坏。 */
  var mathStore = [];

  function stashMath(text) {
    mathStore = [];
    // 1. 围栏代码块（吞掉行首缩进，避免占位符被当成缩进代码块）
    var codes = [];
    text = text.replace(/(^|\n)[ \t]*(```[\s\S]*?```)/g, function (m, nl, fence) {
      codes.push(fence); return nl + 'ZZCODE' + (codes.length - 1) + 'ZZ';
    });
    // 2. 行内代码
    text = text.replace(/`[^`\n]+`/g, function (m) {
      codes.push(m); return 'ZZCODE' + (codes.length - 1) + 'ZZ';
    });
    // 3. 图片地址预编码（源文件路径带空格，marked 解析不了）
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, dest) {
      dest = dest.trim().replace(/^<|>$/g, '');
      var safe = dest.split('/').map(encodeURIComponent).join('/');
      return '![' + alt + '](' + safe + ')';
    });
    // 4. 块级公式 $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (m, tex) {
      mathStore.push({ tex: tex.trim(), display: true });
      return '\nZZMATH' + (mathStore.length - 1) + 'ZZ\n';
    });
    // 5. 行内公式 $...$
    text = text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, function (m, tex) {
      mathStore.push({ tex: tex, display: false });
      return 'ZZMATH' + (mathStore.length - 1) + 'ZZ';
    });
    // 6. \(...\) 与 \[...\]
    text = text.replace(/\\\([\s\S]+?\\\)/g, function (m, tex) {
      mathStore.push({ tex: tex, display: false }); return 'ZZMATH' + (mathStore.length - 1) + 'ZZ';
    });
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, function (m, tex) {
      mathStore.push({ tex: tex.trim(), display: true }); return '\nZZMATH' + (mathStore.length - 1) + 'ZZ\n';
    });
    return { text: text, codes: codes };
  }

  function restoreCode(html, codes) {
    return html.replace(/ZZCODE(\d+)ZZ/g, function (m, i) {
      var raw = codes[+i];
      if (raw.indexOf('```') === 0) {
        var mm = raw.match(/^```([^\n]*)\n([\s\S]*?)\n?```$/);
        var lang = mm && mm[1] ? mm[1].trim() : '';
        var body = mm ? mm[2] : raw;
        return '<pre><code class="' + (lang ? 'language-' + esc(lang) : '') + '">' + esc(body) + '</code></pre>';
      }
      return '<code>' + esc(raw.replace(/^`|`$/g, '')) + '</code>';
    });
  }

  function renderMath(rootEl) {
    var nodes = rootEl.querySelectorAll('.math-tex');
    Array.prototype.forEach.call(nodes, function (el) {
      var s = mathStore[+el.getAttribute('data-i')];
      if (!s) return;
      var holder = document.createElement(s.display ? 'div' : 'span');
      holder.className = s.display ? 'math-block' : 'math-inline';
      el.parentNode.replaceChild(holder, el);
      try {
        katex.render(s.tex, holder, {
          displayMode: s.display, throwOnError: false, strict: 'ignore',
          errorColor: '#c62828', macros: { '\\bm': '\\boldsymbol{#1}' }
        });
      } catch (e) {
        holder.textContent = s.tex; holder.className += ' math-error';
      }
    });
  }

  function renderMarkdown(raw, bodyEl) {
    var st = stashMath(raw);
    var html = marked.parse(st.text);
    html = restoreCode(html, st.codes);
    html = html.replace(/ZZMATH(\d+)ZZ/g, function (m, i) {
      return '<span class="math-tex" data-i="' + i + '"></span>';
    });
    bodyEl.innerHTML = html;
    // 还原公式
    renderMath(bodyEl);
    // 图片路径 rebase（相对 md 文件所在目录）
    var base = enc(currentPath.replace(/[^/]*$/, ''));
    Array.prototype.forEach.call(bodyEl.querySelectorAll('img'), function (img) {
      var src = img.getAttribute('src') || '';
      if (!/^(https?:|data:|\/)/.test(src)) img.src = new URL(src, location.origin + location.pathname.replace(/index\.html$/, '') + base).href;
    });
    // 标题 id + TOC
    buildToc(bodyEl);
    // 代码高亮
    if (window.hljs) {
      Array.prototype.forEach.call(bodyEl.querySelectorAll('pre code'), function (el) {
        try { hljs.highlightElement(el); } catch (e) {}
      });
    }
  }

  /* ================= 思维导图（markmap） ================= */
  function renderMindmap(title, text, body) {
    if (!(window.markmap && window.markmap.Transformer && window.markmap.Markmap)) {
      return renderMarkdown(text, body);      // 库缺失时降级为普通 md 渲染
    }
    body.innerHTML =
      '<h2 style="text-align:center;margin-top:.2em">' + esc(title) + '</h2>' +
      '<div class="mindmap-tools"><button id="mm-fit" type="button">适应画布</button>' +
      '<span class="hint">滚轮缩放 · 拖拽平移 · 点击节点展开/收起</span></div>' +
      '<div class="mindmap-wrap"><svg id="mm-svg"></svg></div>';
    try {
      var transformer = new window.markmap.Transformer();
      var result = transformer.transform(text);
      var mm = window.markmap.Markmap.create(document.getElementById('mm-svg'), {
        maxWidth: 300, duration: 250, spacingHorizontal: 90,
        spacingVertical: 8, initialExpandLevel: 2
      }, result.root);
      document.getElementById('mm-fit').onclick = function () { mm.fit(); };
    } catch (e) {
      body.innerHTML = '<div class="empty-state">思维导图渲染失败：' + esc(String(e)) + '</div>';
    }
  }

  /* ================= 图片灯箱 + 站内链接拦截 ================= */
  function initLightbox() {
    var box = document.createElement('div');
    box.id = 'lightbox';
    box.innerHTML = '<img alt="">';
    document.body.appendChild(box);
    content.addEventListener('click', function (ev) {
      var img = ev.target;
      if (img.tagName !== 'IMG' || !img.closest('.md-body')) return;
      box.querySelector('img').src = img.src;
      box.classList.add('open');
    });
    box.addEventListener('click', function () { box.classList.remove('open'); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') box.classList.remove('open');
    });
    // 站内 .md 链接 → hash 路由（思维导图大纲里的 📖 链接等）
    content.addEventListener('click', function (ev) {
      var a = ev.target.closest ? ev.target.closest('a') : null;
      if (!a || !a.closest('.md-body')) return;
      var href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href) || href.charAt(0) === '#') return;
      var clean = href.split('#')[0].split('?')[0];
      if (!/\.md$/i.test(clean)) return;
      ev.preventDefault();
      var rel;
      try { rel = decodeURIComponent(clean); } catch (e) { rel = clean; }
      rel = rel.replace(/^\.\//, '');
      if (rel.charAt(0) !== '/') rel = currentPath.replace(/[^/]*$/, '') + rel;
      location.hash = '#/p/' + encodeURIComponent(rel.replace(/^\/+/, ''));
    });
  }

  /* ================= TOC（层级树：默认只到节标题，点击/滚动展开） ================= */
  var tocNodes = {};      // id -> node
  var tocUser = {};       // 用户手动展开的节点
  var tocAuto = {};       // 滚动时自动展开的祖先链（随 active 切换重建）

  function tocIsOpen(id) { return !!(tocUser[id] || tocAuto[id]); }

  function buildToc(bodyEl) {
    spyHeadings = [];
    tocNodes = {}; tocUser = {}; tocAuto = {};
    var heads = bodyEl.querySelectorAll('h2,h3,h4,h5,h6');
    var root = { id: '__root__', lv: 1, children: [], parent: null };
    var stack = [root];
    Array.prototype.forEach.call(heads, function (h, i) {
      h.id = 'sec-' + i;
      var n = { id: h.id, lv: +h.tagName[1],
        text: (h.textContent.trim() || '（无标题）').slice(0, 60),
        el: h, children: [], parent: null };
      tocNodes[n.id] = n;
      while (stack.length > 1 && stack[stack.length - 1].lv >= n.lv) stack.pop();
      n.parent = stack[stack.length - 1].id;
      stack[stack.length - 1].children.push(n);
      stack.push(n);
      spyHeadings.push(n);
    });
    // 默认展开到节标题（h3）：打开章标题（h2）这一层
    root.children.forEach(function (n) { tocAuto[n.id] = 1; });
    tocList.innerHTML = '';
    tocList.appendChild(renderTocChildren(root, true));
    applyTocState();
    $('#toc').style.display = spyHeadings.length ? '' : 'none';
  }

  function renderTocChildren(node, isRoot) {
    var container = document.createElement('div');
    if (!isRoot) { container.className = 'toc-children'; container.setAttribute('data-parent', node.id); }
    node.children.forEach(function (n) {
      var wrap = document.createElement('div');
      wrap.className = 'toc-node';
      wrap.setAttribute('data-id', n.id);
      wrap.setAttribute('data-lv', n.lv);
      var row = document.createElement('div');
      row.className = 'toc-row';
      row.setAttribute('data-target', n.id);
      row.title = n.text;
      row.innerHTML = '<span class="toc-caret' + (n.children.length ? '' : ' leaf') + '">▸</span>' +
        '<span class="toc-text">' + esc(n.text) + '</span>';
      wrap.appendChild(row);
      if (n.children.length) wrap.appendChild(renderTocChildren(n, false));
      container.appendChild(wrap);
    });
    return container;
  }

  function applyTocState() {
    Array.prototype.forEach.call(tocList.querySelectorAll('.toc-node'), function (w) {
      w.classList.toggle('open', tocIsOpen(w.getAttribute('data-id')));
    });
  }

  tocList.addEventListener('click', function (ev) {
    var row = ev.target.closest('.toc-row');
    if (!row) return;
    var id = row.getAttribute('data-target');
    var n = tocNodes[id];
    if (!n) return;
    var caret = ev.target.closest('.toc-caret');
    if (caret && !caret.classList.contains('leaf')) {
      // 点箭头：仅切换展开/收起，不滚动
      if (tocIsOpen(id)) delete tocUser[id]; else tocUser[id] = 1;
      applyTocState();
      return;
    }
    // 点条目：跳转；有子标题则顺手展开
    if (n.children.length) tocUser[id] = 1;
    var t = document.getElementById(id);
    if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 66, behavior: 'smooth' });
    applyTocState();
  });

  var spyTick = false;
  window.addEventListener('scroll', function () {
    if (spyTick) return;
    spyTick = true;
    requestAnimationFrame(function () {
      spyTick = false;
      var act = null;
      for (var i = 0; i < spyHeadings.length; i++) {
        if (spyHeadings[i].el.getBoundingClientRect().top < 80) act = spyHeadings[i].id;
      }
      Array.prototype.forEach.call(tocList.querySelectorAll('.toc-row'), function (a) {
        a.classList.toggle('active', a.getAttribute('data-target') === act);
      });
      // 滚动联动：自动展开到当前显示部分（祖先链）
      if (act) {
        tocAuto = {};
        var p = tocNodes[act] && tocNodes[act].parent;
        while (p && p !== '__root__') { tocAuto[p] = 1; p = tocNodes[p] && tocNodes[p].parent; }
        applyTocState();
        var actEl = tocList.querySelector('.toc-row.active');
        if (actEl && !tocEl.classList.contains('collapsed')) {
          var top = actEl.offsetTop - tocEl.clientHeight / 2;
          tocEl.scrollTop = Math.max(0, Math.min(top, tocList.scrollHeight - tocEl.clientHeight));
        }
      }
    });
  });

  /* ================= 目录树 ================= */
  function fileIcon(name) {
    if (/作业/.test(name)) return '✏️ ';
    if (/公式/.test(name)) return '📐 ';
    if (/思维导图/.test(name)) return '🧠 ';
    if (/教案|教材/.test(name)) return '📘 ';
    return '📄 ';
  }
  function folderIcon(name) { return /笔记/.test(name) ? '📚 ' : '📁 '; }

  function nodeRow(node, key, isFile) {
    var row = document.createElement('div');
    row.className = 'node-row';
    row.setAttribute('data-key', key);
    if (isFile) {
      row.setAttribute('data-path', node.path);
      row.innerHTML = '<span class="node-caret" style="visibility:hidden"></span><span>' + fileIcon(node.name) + esc(node.name) + '</span>';
      row.onclick = function () { location.hash = '#/p/' + encodeURIComponent(node.path); closeSidebarMobile(); };
    } else {
      row.innerHTML = '<span class="node-caret' + (expanded[key] ? ' open' : '') + '">▶</span><span>' + folderIcon(node.name) + esc(node.name) + '</span>';
      row.onclick = function () {
        expanded[key] = !expanded[key];
        var ch = row.nextElementSibling;
        if (ch) { ch.classList.toggle('open', expanded[key]); row.querySelector('.node-caret').classList.toggle('open', expanded[key]); }
      };
    }
    return row;
  }

  function buildNodes(nodes, parentKey, container) {
    nodes.forEach(function (n) {
      var key = parentKey ? parentKey + '/' + n.name : n.name;
      if (n.path) {
        container.appendChild(nodeRow(n, key, true));
      } else {
        container.appendChild(nodeRow(n, key, false));
        var ch = document.createElement('div');
        ch.className = 'node-children' + (expanded[key] ? ' open' : '');
        buildNodes(n.children || [], key, ch);
        container.appendChild(ch);
      }
    });
  }

  function renderTree() {
    treeEl.innerHTML = '';
    manifest.subjects.forEach(function (s) {
      var wrap = document.createElement('div');
      wrap.className = 'tree-subject';
      buildNodes([s], '', wrap);
      treeEl.appendChild(wrap);
    });
  }

  function expandTo(path) {
    var parts = path.split('/');
    for (var i = 1; i < parts.length; i++) expanded[parts.slice(0, i).join('/')] = true;
  }

  function markActive(path) {
    Array.prototype.forEach.call(treeEl.querySelectorAll('.node-row'), function (row) {
      var p = row.getAttribute('data-path');
      var active = !!path && !!p && p === path;
      row.classList.toggle('active', active);
      if (active) {
        var el = row.parentNode;
        while (el && el !== treeEl) {
          if (el.classList && el.classList.contains('node-children')) {
            el.classList.add('open');
            var frow = el.previousElementSibling;
            if (frow && frow.classList && frow.classList.contains('node-row')) {
              var c = frow.querySelector('.node-caret');
              if (c) c.classList.add('open');
            }
          }
          el = el.parentNode;
        }
      }
    });
  }

  function setActiveTab(name) {
    Array.prototype.forEach.call(tabsEl.querySelectorAll('a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-tab') === name);
    });
  }

  function closeSidebarMobile() {
    sidebar.classList.remove('open'); mask.classList.remove('open');
  }
  $('#menu-btn').onclick = function () {
    sidebar.classList.toggle('open'); mask.classList.toggle('open');
  };
  mask.onclick = closeSidebarMobile;

  /* 左侧目录树收起/展开（桌面端，默认展开，状态跨页保持） */
  sidebar.addEventListener('click', function (ev) {
    if (sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
    }
  });
  $('#sidebar-collapse').addEventListener('click', function (ev) {
    ev.stopPropagation();
    sidebar.classList.add('collapsed');
  });

  /* TOC 收起/展开（默认收起，状态跨页面保持） */
  var tocOpen = false;
  tocEl.addEventListener('click', function (ev) {
    if (tocEl.classList.contains('collapsed')) {
      tocOpen = true;
      tocEl.classList.remove('collapsed');
      return;
    }
    if (ev.target.closest && ev.target.closest('#toc-head')) {
      tocOpen = false;
      tocEl.classList.add('collapsed');
    }
  });

  /* ================= 路由 ================= */
  function route() {
    var raw = location.hash.slice(1);
    var parts = raw.split('/');
    var cmd = parts[1] || 'home';
    var arg = parts.slice(2).join('/');
    try { arg = decodeURIComponent(arg); } catch (e) {}
    window.scrollTo(0, 0);
    tocList.innerHTML = ''; tocEl.style.display = 'none';
    if (cmd === 'p' && arg) return showPage(arg);
    if (cmd === 'search' && arg) return showSearch(arg);
    if (cmd === 'empty') return showEmpty(arg);
    setActiveTab('home');
    showHome();
  }

  function showPage(rel) {
    currentPath = rel;
    var stem = rel.replace(/.*\//, '').replace(/\.md$/, '');
    document.title = stem + ' - 2026考研笔记';
    setActiveTab(rel.split('/')[0]);
    expandTo(rel);
    if (!treeEl.querySelector('.node-row[data-path]')) renderTree();
    markActive(rel);
    content.innerHTML = '<div class="md-body"><div class="loading">加载中...</div></div>';
    fetch(enc(rel)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      var body = content.querySelector('.md-body');
      body.innerHTML = '';
      if (/思维导图大纲/.test(rel)) return renderMindmap(stem, text, body);
      renderMarkdown(text, body);
    }).catch(function (e) {
      content.querySelector('.md-body').innerHTML =
        '<div class="empty-state"><p>😢 笔记加载失败：' + esc(String(e)) + '</p><p style="margin-top:8px;font-size:.85rem">' + esc(rel) + '</p></div>';
    });
  }

  /* ================= 首页 ================= */
  function showHome() {
    currentPath = null;
    document.title = '2026考研笔记资料库';
    markActive(null);
    var cards = '';
    var meta = { '408': ['💻', '数据结构·组成·OS·网络'], '数学': ['📐', '高数·线代·概率'], '英语': ['📖', '词汇·语法'], '政治': ['📋', '笔记整理中'] };
    ['408', '数学', '英语', '政治'].forEach(function (s) {
      var first = firstFileOf(s);
      cards += '<a class="subject-card" ' + (first ? 'href="#/p/' + encodeURIComponent(first) + '"' : 'href="#/empty/' + s + '"') + '>' +
        '<span class="icon">' + meta[s][0] + '</span><span class="label">' + s + '</span><span class="hint">' + meta[s][1] + '</span></a>';
    });
    content.innerHTML =
      '<div class="home">' +
      '<h1>2026考研笔记资料库</h1><p class="subtitle">Markdown 直渲染 · KaTeX 公式</p>' +
      '<p class="countdown-label">距离 2026 考研（12.20）</p><div class="countdown-row" id="countdown"></div>' +
      '<div class="home-search"><div class="box"><span>🔍</span><input id="home-search-input" placeholder="搜索笔记关键词..." autocomplete="off"></div>' +
      '<div class="dropdown" id="home-search-dd"></div></div>' +
      '<div class="subject-grid">' + cards + '</div>' +
      '<p class="footer">基于 Markdown 文件渲染 · sync.py 同步 · 本地部署</p></div>';
    SearchUI.bind($('#home-search-input'), $('#home-search-dd'));
    countdown();
  }

  function firstFileOf(subj) {
    if (!manifest) return null;
    var s = manifest.subjects.filter(function (x) { return x.name === subj; })[0];
    if (!s) return null;
    var stack = [s];
    while (stack.length) {
      var n = stack.shift();
      if (n.path) return n.path;
      (n.children || []).forEach(function (c) { stack.push(c); });
    }
    return null;
  }

  function countdown() {
    var el = $('#countdown'); if (!el) return;
    var exam = new Date(2026, 11, 20, 8, 30, 0);
    function tick() {
      if (!document.getElementById('countdown')) { clearInterval(t); return; }
      var diff = exam - new Date();
      if (diff <= 0) { el.innerHTML = '<p style="font-weight:700;color:#e53935">考研加油！</p>'; clearInterval(t); return; }
      var d = Math.floor(diff / 864e5), h = Math.floor(diff % 864e5 / 36e5),
          m = Math.floor(diff % 36e5 / 6e4), s = Math.floor(diff % 6e4 / 1e3);
      el.innerHTML = [d, h, m, s].map(function (v, i) {
        return '<div class="countdown-item"><div class="num">' + v + '</div><div class="unit">' + ['天', '时', '分', '秒'][i] + '</div></div>';
      }).join('');
    }
    tick(); var t = setInterval(tick, 1000);
  }

  /* ================= 搜索结果页 / 空状态 ================= */
  function showSearch(q) {
    setActiveTab('');
    document.title = '搜索: ' + q;
    content.innerHTML = '<div class="panel"><h2>搜索“' + esc(q) + '”</h2><p class="sub" id="sr-count">搜索中...</p><div id="sr-list"></div></div>';
    SearchUI.searchAll(q, function (results) {
      $('#sr-count').textContent = results.length ? '共 ' + results.length + ' 条结果' : '没有找到相关笔记';
      $('#sr-list').innerHTML = results.slice(0, 50).map(function (r) {
        var crumb = r.path.split('/').slice(0, -1).join(' &gt; ');
        return '<a class="sr-item" href="#/p/' + encodeURIComponent(r.path) + '">' +
          '<div class="sr-title">' + r.title + '</div>' +
          '<div class="sr-path">' + crumb + '</div>' +
          '<div class="sr-snippet">' + r.snippet + '</div></a>';
      }).join('');
    });
  }

  function showEmpty(name) {
    setActiveTab(name);
    content.innerHTML = '<div class="panel"><div class="empty-state"><p style="font-size:2rem">📋</p><p>' + esc(name) + '笔记整理中，敬请期待</p></div></div>';
  }

  /* ================= 启动 ================= */
  function buildTabs() {
    var html = '<a data-tab="home" href="#/home">首页</a>';
    ['408', '数学', '英语', '政治'].forEach(function (s) {
      html += '<a data-tab="' + s + '">' + s + '</a>';
    });
    tabsEl.innerHTML = html;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('a'), function (a) {
      a.onclick = function (ev) {
        var tab = a.getAttribute('data-tab');
        if (tab === 'home') return;             // href 生效
        ev.preventDefault();
        setActiveTab(tab);
        expanded[tab] = true;
        renderTree();
        markActive(currentPath);
        var row = treeEl.querySelector('.node-row[data-key="' + tab + '"]');
        if (row) row.scrollIntoView({ block: 'nearest' });
        if (window.innerWidth <= 860) { sidebar.classList.add('open'); mask.classList.add('open'); }
      };
    });
  }

  fetch('manifest.json').then(function (r) { return r.json(); }).then(function (m) {
    manifest = m;
    renderTree();
    buildTabs();
    SearchUI.init();
    initLightbox();
    route();
  });
  window.addEventListener('hashchange', route);
})();
