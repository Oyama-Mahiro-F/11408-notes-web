// search.js — client-side search for 2026考研笔记
(function () {
  'use strict';

  const SUBJECTS = ['408', '数学', '英语', '政治'];
  const SUBJECT_LABELS = { '408': '408', '数学': '数学', '英语': '英语', '政治': '政治' };

  // ── Bigram tokenizer ─────────────────────────────────
  function bigramTokenize(text) {
    var tokens = [];
    var segments = text.match(/[一-鿿]+|[a-zA-Z0-9]+|\S/g) || [];
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (/[一-鿿]/.test(seg)) {
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
