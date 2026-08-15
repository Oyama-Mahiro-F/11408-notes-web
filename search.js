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
        // Chinese: sliding bigram; keep single chars so single-character queries work
        for (var j = 0; j < seg.length - 1; j++) {
          tokens.push(seg.substring(j, j + 2));
        }
        if (seg.length === 1) {
          tokens.push(seg);
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

  function isSingleChineseChar(token) {
    return token.length === 1 && /[\u4e00-\u9fff]/.test(token);
  }

  // Resolve postings for a token. Single Chinese characters are not stored in the
  // index as unigrams, so expand them by scanning bigram keys containing that char.
  function resolvePostings(inverted, token) {
    if (inverted[token]) return inverted[token];
    if (!isSingleChineseChar(token)) return null;

    var seen = {};
    var out = [];
    for (var key in inverted) {
      if (key.indexOf(token) !== -1) {
        var arr = inverted[key];
        for (var i = 0; i < arr.length; i++) {
          if (!seen[arr[i]]) {
            seen[arr[i]] = true;
            out.push(arr[i]);
          }
        }
      }
    }
    return out.length ? out : null;
  }

  // ── SearchEngine ─────────────────────────────────────
  window.SearchEngine = function () {
    this._indexes = {};       // { subject: { pages: [...], index: {...} } }
    this._loaded = false;
    this._loading = false;
    this._loadError = false;
    this._loadPromise = null;
  };

  SearchEngine.prototype.loadIndexes = function (subjectList) {
    var self = this;
    if (self._loading) return self._loadPromise;
    self._loading = true;

    var fetches = (subjectList || SUBJECTS).map(function (subj) {
      return fetch((typeof SEARCH_BASE !== 'undefined' ? SEARCH_BASE : 'search/') + subj + '.json')
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

  SearchEngine.prototype.ensureLoaded = function () {
    var self = this;
    if (self._loaded) {
      return Promise.resolve();
    }
    return self.loadIndexes();
  };

  SearchEngine.prototype._loadOneIndex = function (subject) {
    var self = this;
    if (self._indexes[subject]) return Promise.resolve();
    return fetch((typeof SEARCH_BASE !== 'undefined' ? SEARCH_BASE : 'search/') + subject + '.json')
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
    var queryLower = (query || '').trim().toLowerCase();

    for (var subj in self._indexes) {
      var idx = self._indexes[subj];
      var pages = idx.pages;
      var inverted = idx.index;

      // AND semantic: intersect page id sets for all tokens
      var candidateIds = null;
      var allMiss = true;
      var tokenPostings = {};
      for (var t = 0; t < tokens.length; t++) {
        var posting = resolvePostings(inverted, tokens[t]);
        if (posting) {
          allMiss = false;
          tokenPostings[t] = posting;
          if (candidateIds === null) {
            candidateIds = posting.slice();
          } else {
            candidateIds = intersect(candidateIds, posting);
          }
        }
      }

      var matchedAll = !!(candidateIds && candidateIds.length > 0);

      // If no intersection, fall back to OR (union)
      if (!candidateIds || candidateIds.length === 0) {
        candidateIds = [];
        var seen = {};
        for (var u = 0; u < tokens.length; u++) {
          var p = resolvePostings(inverted, tokens[u]);
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
        var titleLower = page.title.toLowerCase();
        var textLower = page.text.toLowerCase();
        var score = 0;
        var hitTokens = 0;

        for (var k = 0; k < tokens.length; k++) {
          var tok = tokens[k];
          var lowerTok = tok.toLowerCase();
          var titleHits = countMatches(titleLower, lowerTok);
          var textHits = countMatches(textLower, lowerTok);
          if (titleHits > 0 || textHits > 0) hitTokens++;
          score += titleHits * 3 + textHits;

          // If the inverted index matched this token but the stored text doesn't
          // (should not happen now that full text is stored), keep a small score.
          if (titleHits === 0 && textHits === 0 &&
              tokenPostings[k] && tokenPostings[k].indexOf(pid) !== -1) {
            score += 0.5;
          }
        }

        // Coverage boost: prefer pages matching more query terms
        var coverage = tokens.length ? hitTokens / tokens.length : 0;
        score += coverage * 8;

        // Exact phrase / near-exact title boost
        var exactRank = 0;
        if (queryLower && titleLower.indexOf(queryLower) !== -1) {
          exactRank = 2;  // 完整词条命中标题，最优先
          score += 20;
        } else if (queryLower && textLower.indexOf(queryLower) !== -1) {
          exactRank = 1;  // 完整词条命中正文
          score += 6;
        }

        // Extra boost when all tokens intersect (AND result)
        if (matchedAll && hitTokens === tokens.length) {
          score += 5;
        }

        if (score > 0) {
          results.push({
            title: page.title,
            path: page.path,
            subject: page.subject,
            text: page.text,
            score: Math.round(score * 10) / 10,
            exactRank: exactRank,
          });
        }
      }
    }

    // Sort: exact phrase matches first, then score descending, then title
    results.sort(function (a, b) {
      if (b.exactRank !== a.exactRank) return b.exactRank - a.exactRank;
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title, 'zh-CN');
    });
    return results;
  };

  SearchEngine.prototype.highlight = function (text, query) {
    if (!query || !text) return escapeHTML(text || '');
    var tokens = bigramTokenize(query);
    if (tokens.length === 0) return escapeHTML(text);

    // Build regex from tokens, longest first to avoid partial matches
    tokens.sort(function (a, b) { return b.length - a.length; });
    var escaped = tokens.map(escapeRegex);
    var pattern = new RegExp('(' + escaped.join('|') + ')', 'gi');
    return escapeHTML(text).replace(pattern, '<mark>$1</mark>');
  };

  SearchEngine.prototype.snippet = function (text, query, maxLen) {
    if (!text) return '';
    maxLen = maxLen || 160;
    if (!query) return escapeHTML(text.substring(0, maxLen));

    var tokens = bigramTokenize(query);
    if (tokens.length === 0) return escapeHTML(text.substring(0, maxLen));

    var lowerText = text.toLowerCase();
    var bestPos = -1;
    var bestToken = null;
    for (var i = 0; i < tokens.length; i++) {
      var pos = lowerText.indexOf(tokens[i].toLowerCase());
      if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
        bestPos = pos;
        bestToken = tokens[i];
      }
    }

    if (bestPos === -1) {
      return this.highlight(text.substring(0, maxLen), query);
    }

    var start = Math.max(0, bestPos - 30);
    var end = Math.min(text.length, start + maxLen);
    // If we are near the end, extend backwards to keep a full-length snippet
    if (end - start < maxLen) {
      start = Math.max(0, end - maxLen);
    }
    var prefix = start > 0 ? '…' : '';
    var suffix = end < text.length ? '…' : '';
    return prefix + this.highlight(text.substring(start, end), query) + suffix;
  };

  SearchEngine.prototype.isAvailable = function () {
    // Available only when at least one index is actually in memory.
    // (A completed load with zero indexes means all fetches failed.)
    return Object.keys(this._indexes).length > 0;
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

  function countMatches(lowerText, lowerToken) {
    var count = 0;
    var pos = 0;
    while ((pos = lowerText.indexOf(lowerToken, pos)) !== -1) {
      count++;
      pos += lowerToken.length;
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

  // Compute root-relative base from SEARCH_BASE (injected by add_nav.py)
  var ROOT_BASE = (typeof SEARCH_BASE !== 'undefined' ? SEARCH_BASE : 'search/').replace(/search\/$/, '');

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

  // Ensure indexes are loaded; disable inputs on fatal load error.
  SearchUI.prototype._ensureEngine = function () {
    var self = this;
    return this.engine.ensureLoaded().then(function () {
      if (self.engine.hasError()) {
        var inputs = document.querySelectorAll('.nav-search-input,.home-search-input,#search-page-input');
        for (var i = 0; i < inputs.length; i++) {
          inputs[i].disabled = true;
          inputs[i].placeholder = '搜索不可用';
        }
        return false;
      }
      return true;
    });
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
        html += this._resultItemHtml(r, query, 100);
      }
      if (results.length > MAX_DROPDOWN_ITEMS) {
        html += '<a class="search-dropdown-more" href="' + ROOT_BASE + 'search-results.html?q=' +
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

  SearchUI.prototype._resultItemHtml = function (r, query, snippetLen) {
    var parts = r.path.split('/');
    var subject = parts[0];
    var folder = parts.length > 2 ? parts.slice(1, -1).join(' > ') : '';
    var breadcrumb = (SUBJECT_LABELS[subject] || subject) + (folder ? ' > ' + folder : '');

    return '<a class="search-dropdown-item" href="' + ROOT_BASE + r.path + '#:~:text=' + encodeURIComponent(query) + '">' +
      '<span class="search-dropdown-title">' + this.engine.highlight(r.title, query) + '</span>' +
      '<span class="search-dropdown-meta">' + escapeHTML(breadcrumb) + '</span>' +
      '<span class="search-dropdown-snippet">' + this.engine.snippet(r.text, query, snippetLen) + '</span>' +
      '</a>';
  };

  SearchUI.prototype._closeDropdown = function () {
    if (this._dropdown) this._dropdown.style.display = 'none';
  };

  SearchUI.prototype._showLoading = function (anchorEl) {
    var dd = this._ensureDropdown();
    dd.querySelector('.search-dropdown-list').innerHTML = '<div class="search-dropdown-empty">搜索中...</div>';
    var rect = anchorEl.getBoundingClientRect();
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.left = rect.left + 'px';
    dd.style.display = 'block';
  };

  SearchUI.prototype._doSearch = function (anchorEl, query) {
    var q = (query || '').trim();
    if (!q) {
      if (this._dropdown) this._dropdown.style.display = 'none';
      return;
    }

    var self = this;
    if (!this.engine.isAvailable()) {
      this._showLoading(anchorEl);
      this._ensureEngine().then(function (ok) {
        if (!ok) return;
        var results = self.engine.search(q);
        self._showDropdown(anchorEl, results, q);
        self._renderFullResults(q, results);
      });
      return;
    }

    var results = this.engine.search(q);
    this._showDropdown(anchorEl, results, q);
    this._renderFullResults(q, results);
  };

  // ── Nav header search ────────────────────────────────
  SearchUI.prototype._createNavSearch = function () {
    var header = document.querySelector('.nav-header');
    if (!header) return;

    var self = this;

    // Create container with always-visible input
    var wrapper = document.createElement('div');
    wrapper.className = 'nav-search-wrap';
    wrapper.innerHTML =
      '<input type="text" class="nav-search-input" placeholder="搜索笔记...">';
    header.appendChild(wrapper);

    var input = wrapper.querySelector('.nav-search-input');
    this._navInput = wrapper;

    // Input handler
    input.addEventListener('input', function () {
      self._debouncedSearch(wrapper, input.value);
    });

    // Ctrl+K shortcut → focus search
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        input.focus();
      }
    });
  };

  // ── Home page search box ─────────────────────────────
  SearchUI.prototype._createHomeSearch = function () {
    var self = this;
    var input, dropdownList, wrap;

    // Case 1: search box already in HTML (main index page from gen_main_index)
    var existing = document.querySelector('.home-search-input');
    if (existing) {
      input = existing;
      wrap = existing.closest('.home-search-wrap');
      dropdownList = wrap ? wrap.querySelector('.search-dropdown-list') : null;
      if (!dropdownList) {
        dropdownList = document.createElement('div');
        dropdownList.className = 'search-dropdown-list';
        dropdownList.style.display = 'none';
        wrap.appendChild(dropdownList);
      }
      this._homeInput = wrap;
    } else {
      // Case 2: section index page — create search box dynamically
      var grid = document.querySelector('.idx-grid');
      var subtitle = document.querySelector('.idx-subtitle');
      var referenceEl = grid || subtitle;
      if (!referenceEl || !referenceEl.parentNode) return;

      wrap = document.createElement('div');
      wrap.className = 'home-search-wrap';
      wrap.innerHTML =
        '<div class="home-search-box">' +
        '<span class="home-search-icon">🔍</span>' +
        '<input type="text" class="home-search-input" placeholder="搜索笔记关键词...">' +
        '</div>' +
        '<div class="search-dropdown-list" style="display:none"></div>';
      referenceEl.parentNode.insertBefore(wrap, referenceEl);

      input = wrap.querySelector('.home-search-input');
      dropdownList = wrap.querySelector('.search-dropdown-list');
      this._homeInput = wrap;
    }

    var debouncedHomeSearch = debounce(function () {
      var q = input.value.trim();
      if (!q) {
        dropdownList.style.display = 'none';
        return;
      }
      if (!self.engine.isAvailable()) {
        dropdownList.innerHTML = '<div class="search-dropdown-empty">搜索中...</div>';
        dropdownList.style.display = 'block';
        self._ensureEngine().then(function (ok) {
          if (!ok) {
            dropdownList.innerHTML = '<div class="search-dropdown-empty">搜索不可用</div>';
            return;
          }
          self._renderHomeResults(dropdownList, q);
        });
        return;
      }
      self._renderHomeResults(dropdownList, q);
    }, DEBOUNCE_MS);

    input.addEventListener('input', function () {
      debouncedHomeSearch();
    });

    // Click outside closes
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) {
        dropdownList.style.display = 'none';
      }
    });
  };

  SearchUI.prototype._renderHomeResults = function (dropdownList, q) {
    var results = this.engine.search(q);
    if (results.length === 0) {
      dropdownList.innerHTML = '<div class="search-dropdown-empty">未找到匹配的笔记</div>';
    } else {
      var html = '';
      for (var i = 0; i < Math.min(results.length, MAX_DROPDOWN_ITEMS); i++) {
        html += this._resultItemHtml(results[i], q, 100);
      }
      if (results.length > MAX_DROPDOWN_ITEMS) {
        html += '<a class="search-dropdown-more" href="' + ROOT_BASE + 'search-results.html?q=' +
          encodeURIComponent(q) + '">查看全部 ' + results.length + ' 条结果 →</a>';
      }
      dropdownList.innerHTML = html;
    }
    dropdownList.style.display = 'block';
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
        '<a class="search-result-title" href="' + ROOT_BASE + r.path + '#:~:text=' + encodeURIComponent(query) + '">' +
        self.engine.highlight(r.title, query) + '</a>' +
        '<div class="search-result-meta">' +
        '<span class="search-result-subject">' + (SUBJECT_LABELS[subject] || subject) + '</span>' +
        '<span class="search-result-path">' + escapeHTML(breadcrumb) + '</span>' +
        '</div>' +
        '<div class="search-result-snippet">' +
        self.engine.snippet(r.text, query, 200) +
        '</div>' +
        '</div>';
    }

    container.innerHTML = html;
  };

  SearchUI.prototype.searchAndRender = function (query) {
    var self = this;
    var container = document.getElementById('search-results-container');
    if (!container) return;

    var q = (query || '').trim();
    if (!q) {
      container.innerHTML = '';
      return;
    }

    if (!this.engine.isAvailable()) {
      container.innerHTML = '<p class="search-results-summary">搜索中...</p>';
      this._ensureEngine().then(function (ok) {
        if (ok) self._renderFullResults(q, self.engine.search(q));
      });
      return;
    }

    self._renderFullResults(q, self.engine.search(q));
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
        this.searchAndRender(query);
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
