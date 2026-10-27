/* Markdown + KaTeX 渲染管线（自站点 app.js 移植：先摘走代码块与公式 → marked → 还原 → KaTeX）。
   App 内图片重写为站点 CDN 地址（离线时图片不显示，正文不受影响）。 */
(function () {
  'use strict';

  var mathStore = [];
  var escRe = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  function encodeDest(raw) {
    var dest = (raw || '').trim(), title = '';
    var tm = dest.match(/\s+(["'])([^"']*)\1$/);
    if (tm) { title = dest.slice(tm.index); dest = dest.slice(0, tm.index); }
    dest = dest.replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.\-]*:|\/|#)/i.test(dest)) return dest + title;
    var plain = dest;
    try { plain = decodeURIComponent(dest); } catch (e) {}
    return plain.split('/').map(encodeURIComponent).join('/') + title;
  }

  function stashMath(text) {
    mathStore = [];
    var codes = [];
    text = text.replace(/(^|\n)[ \t]*(```[\s\S]*?```)/g, function (m, nl, fence) {
      codes.push(fence); return nl + 'ZZCODE' + (codes.length - 1) + 'ZZ';
    });
    text = text.replace(/`[^`\n]+`/g, function (m) {
      codes.push(m); return 'ZZCODE' + (codes.length - 1) + 'ZZ';
    });
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (m, tex) {
      mathStore.push({ tex: tex.trim(), display: true });
      return '\nZZMATH' + (mathStore.length - 1) + 'ZZ\n';
    });
    text = text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, function (m, tex) {
      mathStore.push({ tex: tex, display: false });
      return 'ZZMATH' + (mathStore.length - 1) + 'ZZ';
    });
    text = text.replace(/\\\([\s\S]+?\\\)/g, function (m, tex) {
      var t = m.slice(2, -2); mathStore.push({ tex: t, display: false });
      return 'ZZMATH' + (mathStore.length - 1) + 'ZZ';
    });
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, function (m, tex) {
      mathStore.push({ tex: tex.trim(), display: true });
      return '\nZZMATH' + (mathStore.length - 1) + 'ZZ\n';
    });
    text = text.replace(/(!?)\[([^\]\n]*)\]\(([^\n()]*(?:\([^\n()]*\)[^\n()]*)*)\)/g,
      function (m, bang, label, dest) { return bang + '[' + label + '](' + encodeDest(dest) + ')'; });
    return { text: text, codes: codes };
  }

  function restoreCode(html, codes) {
    return html.replace(/ZZCODE(\d+)ZZ/g, function (m, i) {
      var raw = codes[+i];
      if (raw.indexOf('```') === 0) {
        var mm = raw.match(/^```([^\n]*)\n([\s\S]*?)\n?```$/);
        var lang = mm && mm[1] ? mm[1].trim() : '';
        var body = mm ? mm[2] : raw;
        return '<pre><code class="' + (lang ? 'language-' + escRe(lang) : '') + '">' + escRe(body) + '</code></pre>';
      }
      return '<code>' + escRe(raw.replace(/^`|`$/g, '')) + '</code>';
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
      } catch (e) { holder.textContent = s.tex; holder.className += ' math-error'; }
    });
  }

  /* CJK 紧贴 ** 的粗体修复（Obsidian 兼容，与站点同款精简版） */
  var MD_BLOCK_SEL = 'p, li, td, th, h1, h2, h3, h4, h5, h6, dt, dd';
  var MD_SKIP_SEL = 'pre, code, script, style, svg, .katex, .hljs, .math-block, .math-inline';
  function inlineTextNodes(block) {
    var out = [];
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out.push(c); continue; }
        if (c.nodeType !== 1) continue;
        if (c.matches && (c.matches(MD_SKIP_SEL) || c.matches(MD_BLOCK_SEL))) continue;
        walk(c);
      }
    })(block);
    return out;
  }
  function repairEmphasis(rootEl) {
    var blocks = rootEl.querySelectorAll(MD_BLOCK_SEL);
    Array.prototype.forEach.call(blocks, function (block) {
      for (var guard = 0; guard < 30; guard++) {
        var nodes = inlineTextNodes(block);
        if (!nodes.length) return;
        var text = '', pos = [];
        nodes.forEach(function (nd) {
          var v = nd.nodeValue || '';
          for (var k = 0; k < v.length; k++) pos.push([nd, k]);
          text += v;
        });
        var m3 = /\*\*\*([^*]{1,120}?)\*\*\*/.exec(text);
        var m2 = !m3 && /\*\*([^*\n]{1,200}?)\*\*/.exec(text);
        var m = m3 || m2;
        if (!m) return;
        var len = m3 ? 3 : 2;
        var start = pos[m.index + len], end = pos[m.index + len + m[1].length];
        if (!start || !end) return;
        try {
          var range = document.createRange();
          range.setStart(start[0], start[1]); range.setEnd(end[0], end[1]);
          var frag = range.extractContents();
          if (!frag.textContent.trim()) return;
          var strong = document.createElement('strong');
          strong.appendChild(frag);
          range.insertNode(strong);
        } catch (e) { return; }
        // 删掉两侧残留的 * 标记
        var marker = new Array(len + 1).join('*');
        var pn = strong.previousSibling;
        while (pn && pn.nodeType !== 3) pn = pn.previousSibling;
        if (pn && pn.nodeValue.slice(-len) === marker) pn.deleteData(pn.nodeValue.length - len, len);
        var nn = strong.nextSibling;
        while (nn && nn.nodeType !== 3) nn = nn.nextSibling;
        if (nn && nn.nodeValue.slice(0, len) === marker) nn.deleteData(0, len);
      }
    });
  }

  /**
   * 渲染 markdown 到容器。
   * opt: { baseDir: md 所在目录（posix 相对路径，用于图片重写）,
   *        cdnBase: 图片 CDN 前缀（可为数组，依次尝试） }
   */
  function renderMarkdown(raw, bodyEl, opt) {
    opt = opt || {};
    var st = stashMath(raw);
    var html = marked.parse(st.text);
    html = restoreCode(html, st.codes);
    html = html.replace(/ZZMATH(\d+)ZZ/g, function (m, i) {
      return '<span class="math-tex" data-i="' + i + '"></span>';
    });
    bodyEl.innerHTML = html;
    renderMath(bodyEl);
    repairEmphasis(bodyEl);
    // 图片 → 站点 CDN
    var bases = opt.cdnBase || Store.CDN_BASES;
    var base = bases[0];
    var dir = (opt.baseDir || '').split('/').map(encodeURIComponent).join('/');
    Array.prototype.forEach.call(bodyEl.querySelectorAll('img'), function (img) {
      var src = img.getAttribute('src') || '';
      if (/^(https?:|data:)/.test(src)) return;
      var url = base + dir + (dir && !dir.endsWith('/') ? '/' : '') + src;
      img.src = url;
      img.loading = 'lazy';
      img.onerror = function () {
        if (bases.length > 1) { bases = bases.slice(1); img.onerror = null; }
        else { img.style.display = 'none'; return; }
        img.src = bases[0] + dir + (dir && !dir.endsWith('/') ? '/' : '') + src;
      };
    });
    // 站内 .md 链接 → 应用内跳转
    Array.prototype.forEach.call(bodyEl.querySelectorAll('a[href]'), function (a) {
      var href = a.getAttribute('href') || '';
      if (/^#/ .test(href)) return;
      if (/\.md($|[?#])/i.test(decodeURIComponent(href))) {
        a.href = '#/notes/view?' + href;
        return;
      }
      if (!/^(https?:|mailto:)/i.test(href)) a.href = '#';
    });
    if (window.hljs) {
      Array.prototype.forEach.call(bodyEl.querySelectorAll('pre code'), function (el) {
        try { hljs.highlightElement(el); } catch (e) {}
      });
    }
    return bodyEl;
  }

  window.Renderer = { renderMarkdown: renderMarkdown };
})();
