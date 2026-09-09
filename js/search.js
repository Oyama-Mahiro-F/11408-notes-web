/* site2 — 客户端搜索：bigram 分词 + 分科索引懒加载 + 下拉/结果页 */
var SearchUI = (function () {
  'use strict';
  var indexes = {};            // subject -> {pages:[...]}
  var loading = null;

  function fetchAll() {
    if (loading) return loading;
    var subs = ['408', '数学', '英语'];
    loading = Promise.all(subs.map(function (s) {
      return fetch('search/' + encodeURIComponent(s) + '.json')
        .then(function (r) { return r.json(); })
        .then(function (d) { indexes[s] = d; });
    }));
    return loading;
  }

  /* ---------- 分词：中文 bigram + ascii 单词 ---------- */
  function tokenize(q) {
    var tokens = [];
    var cjkRuns = q.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g) || [];
    cjkRuns.forEach(function (run) {
      if (run.length === 1) tokens.push(run);
      for (var i = 0; i < run.length - 1; i++) tokens.push(run.substr(i, 2));
    });
    (q.toLowerCase().match(/[a-z0-9]+/g) || []).forEach(function (w) { tokens.push(w); });
    return tokens;
  }

  function countOf(hay, needle) {
    if (!needle) return 0;
    var n = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* 高亮词表：完整搜索词优先，其余分词按长度降序去重（整词优先整段标出） */
  function buildTerms(q, tokens) {
    var seen = {}, out = [];
    [q].concat(tokens || []).sort(function (a, b) { return (b || '').length - (a || '').length; })
      .forEach(function (t) {
        t = (t || '').trim();
        if (!t || seen[t]) return;
        seen[t] = 1; out.push(t);
      });
    return out;
  }

  function mark(text, terms) {
    var out = esc(text);
    var parts = [];
    (terms || []).forEach(function (t) {
      parts.push(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    });
    if (!parts.length) return out;
    return out.replace(new RegExp('(' + parts.join('|') + ')', 'gi'), '<mark>$1</mark>');
  }

  function snippet(text, tokens, q) {
    var lt = text.toLowerCase();
    var pos = -1;
    if (q) pos = lt.indexOf(q.toLowerCase());            // 锚点优先定位在完整搜索词上
    for (var i = 0; i < tokens.length && pos < 0; i++) pos = lt.indexOf(tokens[i].toLowerCase());
    if (pos < 0) pos = 0;
    var start = Math.max(0, pos - 30), end = Math.min(text.length, pos + 110);
    return (start > 0 ? '...' : '') + mark(text.slice(start, end), buildTerms(q, tokens)) + (end < text.length ? '...' : '');
  }

  function searchAll(q, cb) {
    q = (q || '').trim();
    try { sessionStorage.setItem('site:q', q); } catch (e) {}   // 正文高亮用
    fetchAll().then(function () {
      var tokens = tokenize(q);
      if (!tokens.length) return cb([]);
      var ql = q.toLowerCase();
      var whole = [], part = [];   // 整体匹配层 / 分词匹配层
      Object.keys(indexes).forEach(function (subj) {
        indexes[subj].pages.forEach(function (p) {
          var title = p.title.toLowerCase(), text = p.text.toLowerCase();
          var score = 0;
          tokens.forEach(function (t) {
            score += countOf(title, t) * 4 + Math.min(countOf(text, t), 20);
          });
          var inTitle = title.indexOf(ql) !== -1;
          var inText = text.indexOf(ql) !== -1;
          if (inTitle) score += 15;   // 标题整词命中加权
          if (inText) score += 8;     // 正文整词命中加权
          if (score <= 0) return;
          var r = { title: p.title, path: p.path, score: score,
            snippet: snippet(p.text, tokens, q), whole: inTitle || inText };
          (r.whole ? whole : part).push(r);
        });
      });
      var byScore = function (a, b) { return b.score - a.score; };
      whole.sort(byScore);
      part.sort(byScore);
      cb(whole.concat(part));    // 整体匹配全部置顶，之后才是分词部分匹配
    });
  }

  /* ---------- 下拉 UI ---------- */
  var debounceTimer = null;
  function bind(input, dd) {
    if (!input) return;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var q = input.value.trim();
      if (!q) { dd.style.display = 'none'; return; }
      debounceTimer = setTimeout(function () {
        searchAll(q, function (rs) {
          if (!rs.length) {
            dd.innerHTML = '<div class="dd-empty">没有找到与“' + esc(q) + '”相关的笔记</div>';
            dd.style.display = 'block'; return;
          }
          var terms = buildTerms(q, tokenize(q));
          var html = rs.slice(0, 7).map(function (r) {
            var crumb = r.path.split('/').slice(0, -1).join(' &gt; ');
            return '<a class="dd-item" href="#/p/' + encodeURIComponent(r.path) + '">' +
              '<span class="dd-title">' + mark(r.title, terms) + '</span>' +
              '<span class="dd-crumb">' + crumb + '</span>' +
              '<span class="dd-snippet">' + r.snippet + '</span></a>';
          }).join('');
          html += '<a class="dd-more" href="#/search/' + encodeURIComponent(q) + '">查看全部 ' + rs.length + ' 条结果 →</a>';
          dd.innerHTML = html;
          dd.style.display = 'block';
        });
      }, 180);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        var q = input.value.trim();
        if (q) location.hash = '#/search/' + encodeURIComponent(q);
        dd.style.display = 'none';
      }
      if (ev.key === 'Escape') dd.style.display = 'none';
    });
    document.addEventListener('click', function (ev) {
      if (!dd.contains(ev.target) && ev.target !== input) dd.style.display = 'none';
    });
  }

  /* ---------- 正文命中高亮（搜索后进入笔记时标注术语） ---------- */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function currentQ() {
    try { return sessionStorage.getItem('site:q') || ''; } catch (e) { return ''; }
  }

  function currentTerms() {
    var q = currentQ();
    return q ? buildTerms(q, tokenize(q)) : [];
  }

  var CHIP_ID = 'q-chip';

  function removeChip() {
    var c = document.getElementById(CHIP_ID);
    if (c) c.remove();
  }

  function clearHighlight() {
    try { sessionStorage.removeItem('site:q'); } catch (e) {}
    document.querySelectorAll('.md-body mark.search-hit').forEach(function (mk) {
      var parent = mk.parentNode;
      while (mk.firstChild) parent.insertBefore(mk.firstChild, mk);
      parent.removeChild(mk);
      parent.normalize();
    });
    removeChip();
  }

  function showChip(q, hits) {
    removeChip();
    if (!hits) return;
    var chip = document.createElement('div');
    chip.id = CHIP_ID;
    chip.innerHTML = '🟡 已标注 “' + esc(q) + '” ' + hits + ' 处 <span class="q-chip-x">✕ 清除</span>';
    chip.querySelector('.q-chip-x').onclick = function (ev) {
      ev.stopPropagation();
      clearHighlight();
    };
    document.body.appendChild(chip);
  }

  function highlightBody(root) {
    root.querySelectorAll('mark.search-hit').forEach(function (mk) {
      var parent = mk.parentNode;
      while (mk.firstChild) parent.insertBefore(mk.firstChild, mk);
      parent.removeChild(mk);
    });
    removeChip();
    var terms = currentTerms();
    if (!terms.length) return;
    var re = new RegExp('(' + terms.map(escRe).join('|') + ')', 'gi');
    var reTest = new RegExp('(' + terms.map(escRe).join('|') + ')', 'i');
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE') return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('pre, code, .katex, .hljs, mark.search-hit')) return NodeFilter.FILTER_REJECT;
        if (!n.nodeValue || !reTest.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      var frag = document.createDocumentFragment();
      var s = n.nodeValue, last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(s)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var mk = document.createElement('mark');
        mk.className = 'search-hit';
        mk.textContent = m[0];
        frag.appendChild(mk);
        last = m.index + m[0].length;
      }
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      if (frag.childNodes.length) n.parentNode.replaceChild(frag, n);
    });
    showChip(currentQ(), nodes.length);
  }

  function init() {
    bind(document.getElementById('nav-search-input'), document.getElementById('nav-search-dd'));
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        var inp = document.getElementById('nav-search-input');
        inp && inp.focus();
      }
    });
  }

  return { init: init, bind: bind, searchAll: searchAll,
           highlightBody: highlightBody, clearHighlight: clearHighlight,
           currentQ: currentQ };
})();
