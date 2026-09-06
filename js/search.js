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
  function mark(text, tokens) {
    var out = esc(text);
    tokens.forEach(function (t) {
      out = out.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        function (m) { return '<mark>' + m + '</mark>'; });
    });
    return out;
  }

  function snippet(text, tokens) {
    var pos = -1;
    for (var i = 0; i < tokens.length && pos < 0; i++) pos = text.indexOf(tokens[i]);
    if (pos < 0) pos = 0;
    var start = Math.max(0, pos - 30), end = Math.min(text.length, pos + 110);
    return (start > 0 ? '...' : '') + mark(text.slice(start, end), tokens) + (end < text.length ? '...' : '');
  }

  function searchAll(q, cb) {
    fetchAll().then(function () {
      var tokens = tokenize(q);
      if (!tokens.length) return cb([]);
      var results = [];
      Object.keys(indexes).forEach(function (subj) {
        indexes[subj].pages.forEach(function (p) {
          var title = p.title.toLowerCase(), text = p.text.toLowerCase();
          var score = 0;
          tokens.forEach(function (t) {
            score += countOf(title, t) * 4 + Math.min(countOf(text, t), 20);
          });
          var ql = q.toLowerCase();
          if (title.indexOf(ql) !== -1) score += 15;   // 标题整词命中加权
          if (text.indexOf(ql) !== -1) score += 8;
          if (score > 0) {
            results.push({ title: p.title, path: p.path, score: score,
              snippet: snippet(p.text, tokens) });
          }
        });
      });
      results.sort(function (a, b) { return b.score - a.score; });
      cb(results);
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
          var tokens = tokenize(q);
          var html = rs.slice(0, 7).map(function (r) {
            var crumb = r.path.split('/').slice(0, -1).join(' &gt; ');
            return '<a class="dd-item" href="#/p/' + encodeURIComponent(r.path) + '">' +
              '<span class="dd-title">' + mark(r.title, tokens) + '</span>' +
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

  return { init: init, bind: bind, searchAll: searchAll };
})();
