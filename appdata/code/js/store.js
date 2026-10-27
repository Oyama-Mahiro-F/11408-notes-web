/* 数据层：内置 JSON 加载 + IndexedDB 在线刷新覆盖 + 进度存储 + 复习调度 */
(function () {
  'use strict';

  var DATA_FILES = ['words.json', 'politics.json', 'quiz.json', 'cards.json',
    'selfcheck.json', 'manifest.json'];           // 启动即载
  var LAZY_FILES = ['notes.json', 'search.json']; // 笔记页按需载

  var D = { _meta: {} };        // 数据容器
  var ready = null;             // 启动 Promise

  /* ---------- IndexedDB（在线刷新的数据存这里，启动时优先用） ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      var q = indexedDB.open('kaoyan', 1);
      q.onupgradeneeded = function () { q.result.createObjectStore('appdata'); };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var t = db.transaction('appdata').objectStore('appdata').get(key);
        t.onsuccess = function () { res(t.result || null); };
        t.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function idbSet(key, val) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('appdata', 'readwrite').objectStore('appdata').put(val, key);
        t.onsuccess = res; t.onerror = function () { rej(t.error); };
      });
    });
  }
  function idbClear() {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var t = db.transaction('appdata', 'readwrite').objectStore('appdata').clear();
        t.onsuccess = res; t.onerror = res;
      });
    });
  }

  function fetchJson(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  function loadOne(name) {
    return idbGet(name).then(function (cached) {
      if (cached && cached.json) { D[name.replace('.json', '')] = cached.json; D._meta[name] = { sha: cached.sha, from: 'refresh' }; return; }
      return fetchJson('/data/' + name).then(function (j) {
        D[name.replace('.json', '')] = j; D._meta[name] = { from: 'bundled' };
      }).catch(function (e) { console.warn('load fail', name, e); });
    });
  }

  function boot() {
    if (ready) return ready;
    ready = Promise.all([
      // 内置数据的指纹表：让首次「检查更新」能做增量比对，而不是全量下载
      fetchJson('/data/appdata_index.json').then(function (j) { D._dataShas = j.files || {}; })
        .catch(function () { D._dataShas = {}; })
    ].concat(DATA_FILES.map(loadOne)));
    return ready;
  }

  function ensureLazy(name) {
    if (D[name.replace('.json', '')]) return Promise.resolve();
    return loadOne(name);
  }

  /* ---------- 在线更新（数据 + 应用代码） ---------- */
  var CDN_BASES = [
    'https://cdn.jsdelivr.net/gh/Oyama-Mahiro-F/11408-notes-web@main/',
    'https://oyama-mahiro-f.github.io/11408-notes-web/'
  ];
  function tryFetch(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  /* 双源并行取 manifest，取时间戳更新的那份（jsDelivr 对 @main 有缓存，Pages 慢但新），
     两个源都不可达时返回 null。manifest 需带 t（epoch ms）。 */
  function fetchIndexAny(path) {
    return new Promise(function (res) {
      var done = 0, best = null, total = CDN_BASES.length;
      CDN_BASES.forEach(function (b) {
        tryFetch(b + path).then(function (j) {
          j._base = b;
          if (!best || (j.t || 0) > (best.t || 0)) best = j;
          if (++done === total) res(best);
        }, function () {
          if (++done === total) res(best);
        });
      });
    });
  }
  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    });
  }

  function dataUpdate(log) {
    return fetchIndexAny('appdata/index.json').then(function (idx) {
      if (!idx) return { updated: false, err: true };
      var shas = D._dataShas || {};
      var changed = [];
      Object.keys(idx.files || {}).forEach(function (f) {
        var m = D._meta[f];
        var curSha = (m && m.sha) || shas[f];
        if (!curSha || curSha !== idx.files[f].sha) changed.push(f);
      });
      if (!changed.length) return { updated: false, version: idx.version };
      var base = idx._base;
      return Promise.all(changed.map(function (f) {
        return tryFetch(base + 'appdata/' + f).then(function (j) {
          return idbSet(f, { sha: idx.files[f].sha, json: j }).then(function () {
            D[f.replace('.json', '')] = j;
            D._meta[f] = { sha: idx.files[f].sha, from: 'refresh' };
            if (log) log('已更新 ' + f);
          });
        });
      })).then(function () { return { updated: true, version: idx.version, files: changed }; });
    }).catch(function () { return { updated: false, err: true }; });
  }

  /* 应用代码覆盖：按版本号 —— app_index.vcode 大于本地（内置 BUILD.v / 当前覆盖 vcode）才拉取。
     同版本号的改动不覆盖（发版请递增 versionCode），避免意外回退。 */
  var CODE_LS = 'kaoyan_code_v1';
  function currentCodeOv() {
    try { return JSON.parse(localStorage.getItem(CODE_LS) || 'null'); } catch (e) { return null; }
  }
  function buildV() { return parseInt(window.BUILD && window.BUILD.v) || 0; }
  function codeUpdate(log) {
    return fetchIndexAny('appdata/app_index.json').then(function (idx) {
      if (!idx) return { codeUpdated: false, err: true };
      var ov = currentCodeOv();
      var localV = Math.max(buildV(), (ov && ov.vcode) || 0);
      if (!((idx.vcode || 0) > localV)) return { codeUpdated: false, version: idx.version || ('v' + (idx.vcode || '?')) };
      var names = Object.keys(idx.files || {});
      var base = idx._base;
      return Promise.all(names.map(function (f) {
        return fetchText(base + 'appdata/code/' + f).then(function (text) {
          return { f: f, text: text };
        });
      })).then(function (arr) {
        var out = { t: idx.t, version: idx.version, vcode: idx.vcode, files: {} };
        arr.forEach(function (x) { out.files[x.f] = x.text; });
        localStorage.setItem(CODE_LS, JSON.stringify(out));
        if (log) log('应用代码已更新到 v' + (idx.version || idx.vcode));
        return { codeUpdated: true, count: arr.length, version: idx.version, vcode: idx.vcode };
      });
    }).catch(function () { return { codeUpdated: false, err: true }; });
  }

  /* 新版本 APK 检测：app_release.json（GitHub Release 元数据）vcode 大于内置 → 提示下载 */
  function releaseCheck() {
    return fetchIndexAny('appdata/app_release.json').then(function (r) {
      if (!r || !r.vcode) return { none: true };
      return { release: r, newer: r.vcode > buildV() };
    }).catch(function () { return { none: true, err: true }; });
  }

  function checkUpdate(log) {
    return Promise.all([dataUpdate(log), codeUpdate(log), releaseCheck()]).then(function (rs) {
      var d = rs[0], c = rs[1], r = rs[2];
      return {
        updated: !!(d && d.updated), version: d && d.version, files: d && d.files,
        codeUpdated: !!(c && c.codeUpdated), code: c,
        release: (r && r.release) || null, newVersion: !!(r && r.newer),
        err: !!(d && d.err && c && c.err)
      };
    });
  }
  function codeInfo() {
    return { ov: currentCodeOv(), build: window.BUILD || null };
  }

  /* ---------- 进度存储 ---------- */
  var PKEY = 'kaoyan_progress_v1';
  var DEFAULT_P = {
    words: {}, quiz: {}, cards: {}, qa: {}, checklist: {}, politics: {},
    wordbook: {},
    log: {}, settings: { dailyWords: 30, dailyQuiz: 20, dailyCards: 30 }
  };
  function loadP() {
    try {
      var raw = JSON.parse(localStorage.getItem(PKEY) || '{}');
      return Object.assign({}, DEFAULT_P, raw, {
        settings: Object.assign({}, DEFAULT_P.settings, raw.settings || {})
      });
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_P)); }
  }
  var P = loadP();
  function saveP() { localStorage.setItem(PKEY, JSON.stringify(P)); }

  /* ---------- 日期工具 ---------- */
  function todayStr(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* 三档自评驱动的重现调度（知识卡/问答/错题通用）：
     bad → 明天；fuzzy → 明天；good → 阶梯 +3d / +7d / 完成 */
  function rate(store, id, rating) {
    var e = store[id] || { s: 0, n: 0 };
    e.n++; e.last = todayStr();
    if (rating === 'bad') { e.s = 0; e.d = addDays(todayStr(), 1); }
    else if (rating === 'fuzzy') { e.s = Math.max(1, e.s); e.d = addDays(todayStr(), 1); }
    else { e.s = (e.s || 0) + 1; e.d = e.s >= 3 ? null : addDays(todayStr(), e.s === 1 ? 3 : 7); }
    store[id] = e;
    touchLog();
    saveP();
  }

  /* 单词专用：艾宾浩斯记忆曲线间隔（复习日 = 学习后第 1、2、4、7、15 天，顺延式）
     ✅ 认识 → 进入下一间隔；⚠️ 模糊 → 当前阶段 +1 天重复；❌ 不会 → 重置回第 1 天
     走完 5 个阶段 = 毕业。首次学习没记住（⚠️/❌）→ 加入生词本 */
  var EB_STAGES = [1, 2, 4, 7, 15];
  function rateWord(sid, rating) {
    var e = P.words[sid] || { s: 0, n: 0 };
    var isFirst = !e.n;
    e.n++; e.last = todayStr();
    if (!e.first) e.first = todayStr();
    if (rating === 'bad') { e.s = 0; e.d = addDays(todayStr(), EB_STAGES[0]); }
    else if (rating === 'fuzzy') { e.d = addDays(todayStr(), 1); }
    else {
      e.s = (e.s || 0) + 1;
      e.d = e.s >= EB_STAGES.length ? null : addDays(todayStr(), EB_STAGES[e.s]);
    }
    P.words[sid] = e;
    if (isFirst && rating !== 'good') {
      P.wordbook[sid] = P.wordbook[sid] || { added: todayStr() };
    }
    touchLog();
    saveP();
  }
  function ebStage(e) { return e && e.n ? Math.min(e.s || 0, EB_STAGES.length) : -1; }
  function ebDone(e) { return !!e && e.d === null && e.n > 0; }
  function isDue(e) { return e && e.d && e.d <= todayStr(); }
  function touchLog() {
    var t = todayStr();
    P.log[t] = P.log[t] || { words: 0, quiz: 0, cards: 0, qa: 0, pol: 0 };
  }
  function bumpLog(kind, n) {
    touchLog();
    P.log[todayStr()][kind] = (P.log[todayStr()][kind] || 0) + (n || 1);
    saveP();
  }
  function streak() {
    var n = 0, d = 0;
    if (!P.log[todayStr()] && !P.log[todayStr(-1)]) return 0;
    d = P.log[todayStr()] ? 0 : 1;
    for (;;) {
      var k = todayStr(-d);
      if (P.log[k] && (P.log[k].words || P.log[k].quiz || P.log[k].cards || P.log[k].qa || P.log[k].pol)) { n++; d++; }
      else break;
    }
    return n;
  }

  /* 政治当天定位：按计划日期；结束后滚动复背 */
  function politicsToday() {
    var days = (D.politics && D.politics.days) || [];
    if (!days.length) return null;
    var t = todayStr();
    for (var i = 0; i < days.length; i++) if (days[i].date === t) return days[i];
    if (t < days[0].date) return days[0];
    // 计划结束：滚动复背 —— 从第 1 天轮换
    var last = days[days.length - 1];
    var past = Math.round((new Date(t + 'T12:00:00') - new Date(last.date + 'T12:00:00')) / 86400000);
    return days[past % days.length];
  }

  window.Store = {
    D: D, P: P,
    boot: boot, ensureLazy: ensureLazy,
    checkUpdate: checkUpdate, releaseCheck: releaseCheck, codeInfo: codeInfo, CDN_BASES: CDN_BASES,
    rate: rate, rateWord: rateWord, EB_STAGES: EB_STAGES, ebStage: ebStage, ebDone: ebDone,
    isDue: isDue, saveP: saveP, loadP: loadP,
    todayStr: todayStr, addDays: addDays,
    bumpLog: bumpLog, streak: streak, politicsToday: politicsToday,
    resetAll: function () { P = loadP.__proto__ ? JSON.parse(JSON.stringify(DEFAULT_P)) : P; localStorage.removeItem(PKEY); location.reload(); }
  };
})();
