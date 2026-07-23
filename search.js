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
