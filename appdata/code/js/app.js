/* 考研复习 App —— 路由与页面 */
(function () {
  'use strict';
  var S = window.Store, D = S.D, P = S.P;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var page = $('#page'), topTitle = $('#topbar-title'), topRight = $('#topbar-right');
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n); }

  /* ================= 路由 ================= */
  var routes = {
    '': renderToday, today: renderToday,
    politics: renderPolitics, 'politics/day': renderPolDay,
    cards: renderCardsHub,
    'cards/words': renderWordsSession,
    'cards/decks': renderDecks, 'cards/deck': renderDeckSession,
    'cards/qa': renderQaList, 'cards/qalist': renderQaSession,
    'cards/check': renderChecklist,
    'cards/wordbook': renderWordbook, 'cards/wbtrain': renderWbTrain,
    'cards/k408': renderK408,
    quiz: renderQuizHub, 'quiz/sec': renderQuizSection,
    notes: renderNotes, 'notes/view': renderNoteView,
    settings: renderSettings
  };
  var TABS = { today: '今日复习', politics: '政治背诵', cards: '背卡', quiz: '错题自测', notes: '笔记', settings: '设置' };

  function nav() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var seg = parts[0].split('/');
    var base = seg.length > 1 ? seg[0] + '/' + seg[1] : seg[0];
    var fn = routes[base] || routes[parts[0]] || renderToday;
    var q = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || '');
    });
    // 裸参数兼容：#/politics/day?2 → arg2=2；#/notes/view?%E7%AC%AC1%E7%AB%A0 → path=…
    if (parts[1] && !q.arg2) {
      if (/^[\d.]+$/.test(parts[1])) q.arg2 = parts[1];
      else if (parts[1].indexOf('=') < 0) q.path = parts[1];
    }
    seg.forEach(function (v, i) { q['arg' + i] = v; });
    window.scrollTo(0, 0);
    fn(q, seg);
    var tab = ['politics/day', 'cards/words', 'cards/deck', 'cards/qalist', 'cards/decks', 'cards/qa', 'cards/check', 'cards/wordbook', 'cards/wbtrain', 'cards/k408', 'quiz/sec', 'notes/view'].indexOf(base) >= 0 ? seg[0] : base;
    document.querySelectorAll('#tabbar .tab').forEach(function (a) {
      a.classList.toggle('on', a.dataset.tab === tab);
    });
    topTitle.textContent = TABS[tab] || '考研复习';
    topRight.innerHTML = '';
  }
  function setTopBack(label) {
    topRight.innerHTML = '<button class="ghost" style="padding:4px 12px;font-size:13px" onclick="history.back()">‹ ' + esc(label || '返回') + '</button>';
  }

  /* ================= 今日 ================= */
  function renderToday() {
    setTopBack(''); topRight.innerHTML = '';
    var t = S.todayStr();
    var log = P.log[t] || {};
    var day = S.politicsToday();
    var s = P.settings;

    var dueWords = Object.keys(P.words).filter(function (k) { return S.isDue(P.words[k]); }).length;
    var dueQuiz = Object.keys(P.quiz).filter(function (k) { return S.isDue(P.quiz[k]); }).length;
    var dueCards = Object.keys(P.cards).filter(function (k) { return S.isDue(P.cards[k]); }).length;
    buildWordQueue();
    var newWords = wordMix.fresh;
    var wbN = Object.keys(P.wordbook).length;
    var polDone = countPolDone();

    var dots = (D.politics ? D.politics.days : []).map(function (d) {
      var st = P.politics[d.day];
      var cls = st && st.done ? 'done' : (st && Object.keys(st.checks || {}).length ? 'partial' : '');
      if (day && d.day === day.day) cls += ' today';
      return '<div class="dot ' + cls + '">' + d.day + '</div>';
    }).join('');

    page.innerHTML =
      '<div class="today-date"><b>' + t.slice(5).replace('-', '月') + '日</b>｜连续打卡 <b style="color:var(--red)">' + S.streak() + '</b> 天' +
      '<span class="spacer"></span><span class="tag ' + (log.words || log.quiz || log.cards ? 'g' : 'gray') + '">' + ((log.words || 0) + (log.quiz || 0) + (log.cards || 0) + (log.qa || 0)) + ' 项已练</span></div>' +

      (day ? '<section class="block"><h3 class="sec">📖 政治背诵<span class="hint">' + (day.round === 2 ? '第二遍' : '第一遍') + ' · ' + day.date + '</span></h3>' +
        '<div style="font-size:14px"><b>第 ' + day.day + ' 天</b>（手册 ' + esc(day.pages) + '）· ' + esc(day.summary).slice(0, 38) + '</div>' +
        '<div class="checkline">' + (day.checkItems || []).map(function (c) {
          var on = P.politics[day.day] && P.politics[day.day].checks && P.politics[day.day].checks[c];
          return '<span class="chk ' + (on ? 'on' : '') + '" data-pol="' + day.day + '" data-chk="' + esc(c) + '">' + (on ? '✓ ' : '') + esc(c) + '</span>';
        }).join('') + '</div>' +
        '<div class="row" style="margin-top:8px"><button class="primary" onclick="location.hash=\'#/politics/day?' + day.day + '\'">进入今天</button>' +
        '<span class="muted">已完成 ' + polDone + '/28 天</span></div>' +
        '<div class="dotline">' + dots + '</div></section>' : '') +

      '<section class="block"><h3 class="sec">✅ 今日任务</h3>' +
      taskItem('🔤', '英语单词', '今日 ' + P.settings.dailyWords + ' 词：复习 ' + wordMix.due + ' + 新词 ' + newWords + (wbN ? '（生词本 ' + wbN + '）' : ''), 'words', wordMix.due + newWords > 0) +
      taskItem('✏️', '错题自测', '到期错题 ' + dueQuiz + ' + 新题', 'quiz', dueQuiz > 0 || true) +
      taskItem('🃏', '知识卡片', '速记卡到期 ' + dueCards + ' + 新卡', 'cards', dueCards > 0 || true) +
      taskItem('❓', '自查问答', '四科自测问答（遮住答案作答）', 'qa', true) +
      '</section>' +

      '<section class="block"><h3 class="sec">📈 总进度</h3>' +
      progressRow('单词', Object.keys(P.words).length, D.words ? D.words.words.length : 0) +
      progressRow('错题', Object.keys(P.quiz).length, totalQuiz()) +
      progressRow('速记卡', Object.keys(P.cards).length, D.cards ? D.cards.decks.reduce(function (a, x) { return a + x.cards.length; }, 0) : 0) +
      progressRow('政治打卡', polDone, 28) +
      '</section>';
  }
  function taskItem(ico, name, sub, kind, go) {
    var href = kind === 'words' ? '#/cards/words' : kind === 'qa' ? '#/cards/qa' :
      kind === 'quiz' ? '#/quiz' : '#/cards/decks';
    return '<div class="task-item"><div class="task-ico">' + ico + '</div><div><div class="task-name">' + name + '</div>' +
      '<div class="task-sub">' + sub + '</div></div><button class="task-go ' + (go ? 'primary' : 'ghost') + '" onclick="location.hash=\'' + href + '\'">开始</button></div>';
  }
  function progressRow(name, done, total) {
    var pct = total ? Math.round(done * 100 / total) : 0;
    return '<div style="margin:8px 0"><div class="row" style="font-size:13.5px"><span>' + name + '</span><span class="spacer"></span>' +
      '<span class="muted">' + done + ' / ' + total + '（' + pct + '%）</span></div><progress value="' + done + '" max="' + total + '"></progress></div>';
  }
  function countNewWords() {
    var s = P.settings, seen = 0;
    var ws = D.words ? D.words.words : [];
    for (var i = 0; i < ws.length && seen < s.dailyWords; i++) if (!P.words[ws[i].sid]) seen++;
    return seen;
  }
  function countPolDone() {
    var n = 0;
    Object.keys(P.politics).forEach(function (k) { if (P.politics[k] && P.politics[k].done) n++; });
    return n;
  }
  function totalQuiz() {
    return D.quiz ? D.quiz.sections.reduce(function (a, s) { return a + s.questions.length + s.freeform.length; }, 0) : 0;
  }

  // 今日政治勾选（事件委托）
  page.addEventListener('click', function (ev) {
    var el = ev.target.closest('.chk[data-pol]');
    if (!el) return;
    var day = +el.dataset.pol, c = el.dataset.chk;
    P.politics[day] = P.politics[day] || { checks: {}, items: {} };
    P.politics[day].checks[c] = !P.politics[day].checks[c];
    var need = (D.politics.days[day - 1].checkItems || []);
    P.politics[day].done = need.every(function (x) { return P.politics[day].checks[x]; });
    if (P.politics[day].done) S.bumpLog('pol', 0);
    S.saveP();
    el.classList.toggle('on', P.politics[day].checks[c]);
    el.textContent = (P.politics[day].checks[c] ? '✓ ' : '') + c;
  });

  /* ================= 政治 ================= */
  function renderPolitics() {
    setTopBack('');
    var day = S.politicsToday();
    var cells = (D.politics ? D.politics.days : []).map(function (d) {
      var st = P.politics[d.day];
      var cls = [];
      if (st && st.done) cls.push('done');
      else if (st && Object.keys(st.checks || {}).length) cls.push('partial');
      if (day && d.day === day.day) cls.push('today');
      if (d.round === 2) cls.push('r2');
      return '<div class="pol-cell ' + cls.join(' ') + '" onclick="location.hash=\'#/politics/day?' + d.day + '\'">' +
        '<div class="d">' + d.day + '</div><div class="dt">' + d.date.slice(5) + (d.round === 2 ? ' · 二' : '') + '</div></div>';
    }).join('');
    page.innerHTML =
      '<section class="block"><h3 class="sec">28 天冲刺计划<span class="hint">已完成 ' + countPolDone() + ' 天</span></h3>' +
      '<div class="pol-grid">' + cells + '</div>' +
      '<p class="muted" style="margin-bottom:0">虚线框为第二遍回顾；实心绿 = 当日打卡完成。</p></section>';
  }

  function renderPolDay(q) {
    var n = +q.arg2 || +(q.day || 1);
    var d = D.politics.days[n - 1];
    if (!d) { page.innerHTML = '<div class="empty">无此天数</div>'; return; }
    setTopBack('计划');
    var st = P.politics[n] || { checks: {}, items: {} };
    P.politics[n] = st;

    var checks = '<div class="checkline">' + (d.checkItems || []).map(function (c) {
      return '<span class="chk ' + (st.checks[c] ? 'on' : '') + '" data-pol="' + n + '" data-chk="' + esc(c) + '">' + (st.checks[c] ? '✓ ' : '') + esc(c) + '</span>';
    }).join('') + '</div>';

    var body = '';
    if (d.round === 2) {
      body = (d.reviewGroups || []).map(function (g) {
        return '<h3 class="sec" style="margin-top:14px">回看第 ' + g.day + ' 天</h3>' +
          g.items.map(function (it, i) { return checkItem(n, 'r' + g.day + '-' + i, it, st); }).join('');
      }).join('') || '<div class="empty">本日为回顾日，清单为空</div>';
    } else {
      body = (d.principles || []).map(function (pr, i) { return principleCard(n, pr, i); }).join('') || '<div class="empty">本日无原理条目</div>';
    }

    page.innerHTML =
      '<section class="block"><h3 class="sec">第 ' + d.day + ' 天｜手册 ' + esc(d.pages) +
      '<span class="hint">' + (d.round === 2 ? '第二遍' : '第一遍') + ' · ' + d.date + '</span></h3>' +
      '<div class="muted">' + esc(d.summary) + '</div>' + checks + '</section>' +
      '<section class="block"><h3 class="sec">' + (d.round === 2 ? '今日自查清单（逐条复述）' : '原理条目（点卡片翻面）') + '</h3>' + body + '</section>';
    S.bumpLog('pol', 0);
    S.saveP();
  }

  function checkItem(day, key, text, st) {
    var on = st.items && st.items[key];
    return '<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)">' +
      '<span class="chk ' + (on ? 'on' : '') + '" data-politem="' + day + '" data-key="' + esc(key) + '">' + (on ? '✓' : '☐') + '</span>' +
      '<span style="flex:1;font-size:14.5px">' + esc(text) + '</span></div>';
  }
  function principleCard(day, pr, i) {
    var back = '';
    if (pr.alias) back += mdInline('**原理名字**：' + pr.alias);
    if (pr.content) back += mdInline('**原理内容**：' + pr.content);
    (pr.extra || []).forEach(function (e) { back += mdInline('**' + e.label + '**：' + e.text); });
    if (pr.method) back += mdInline('**方法论**：' + pr.method);
    if (pr.usage) back += mdInline('**具体运用**：' + pr.usage);
    (pr.tips || []).forEach(function (tp) { back += '<blockquote style="margin:8px 0">' + mdInline('【' + tp + '】') + '</blockquote>'; });
    return '<div class="flip-wrap"><div class="flip" id="pf' + i + '">' +
      '<div class="face"><span class="label">' + esc(pr.part || '') + '</span><div class="front-main">' + esc(pr.name) + '</div>' +
      '<div class="front-sub">' + esc(pr.section || '') + '</div><div class="tap-hint">点击翻面看内容</div></div>' +
      '<div class="face back"><span class="label right">' + esc(pr.name) + '</span><div class="mdview" style="font-size:14px">' + back + '</div></div>' +
      '</div></div>';
  }
  function mdInline(md) {
    var div = document.createElement('div');
    Renderer.renderMarkdown(md, div, {});
    return div.innerHTML;
  }

  // 自测条目勾选
  page.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-politem]');
    if (el) {
      var day = +el.dataset.politem, key = el.dataset.key;
      P.politics[day] = P.politics[day] || { checks: {}, items: {} };
      P.politics[day].items[key] = !P.politics[day].items[key];
      S.saveP();
      el.classList.toggle('on', P.politics[day].items[key]);
      el.textContent = P.politics[day].items[key] ? '✓' : '☐';
      return;
    }
    var f = ev.target.closest('.flip');
    if (f) { f.classList.toggle('flipped'); }
  });

  /* ================= 背卡中心 ================= */
  function renderCardsHub() {
    setTopBack('');
    buildWordQueue();
    var dueW = wordMix.due, freshW = wordMix.fresh;
    var dueC = Object.keys(P.cards).filter(function (k) { return S.isDue(P.cards[k]); }).length;
    var totalCards = D.cards ? D.cards.decks.reduce(function (a, x) { return a + x.cards.length; }, 0) : 0;
    var learned = Object.keys(P.words).length, wsTotal = D.words ? D.words.words.length : 0;
    var wbTotal = Object.keys(P.wordbook).length;
    var wbDone = Object.keys(P.wordbook).filter(function (sid) { return S.ebDone(P.words[sid]); }).length;
    page.innerHTML =
      '<section class="block"><h3 class="sec">🔤 英语单词<span class="hint">艾宾浩斯 1/2/4/7/15 天 · 已学 ' + learned + '/' + wsTotal + '</span></h3>' +
      '<div class="row"><button class="primary" onclick="location.hash=\'#/cards/words\'">开始背词</button>' +
      '<span class="muted">今日 ' + P.settings.dailyWords + ' 词 = 复习 ' + dueW + ' + 新词 ' + freshW + '</span></div>' +
      '<div style="margin-top:8px"><progress value="' + learned + '" max="' + wsTotal + '"></progress></div></section>' +
      '<section class="block"><h3 class="sec">📕 生词本<span class="hint">' + wbTotal + ' 词 · 已掌握 ' + wbDone + '</span></h3>' +
      '<div class="row"><button ' + (wbTotal ? 'class="primary"' : 'class="ghost" disabled') + ' onclick="location.hash=\'#/cards/wordbook\'">查看生词本</button>' +
      '<span class="muted">第一次没记住的词自动收进来</span></div></section>' +
      (function () {
        var k = k408Stats();
        return '<section class="block"><h3 class="sec">🎲 408 随机速记<span class="hint">四科 ' + k.total + ' 个知识点 · 到期 ' + k.due + '</span></h3>' +
          '<div class="row"><button class="primary" onclick="location.hash=\'#/cards/k408\'">随机开刷</button>' +
          '<span class="muted">科目·章节范围可选 · 混排打乱 · 先回想再揭示</span></div></section>';
      })() +
      '<section class="block"><h3 class="sec">🃏 知识速记卡<span class="hint">52 套 · ' + totalCards + ' 张</span></h3>' +
      '<div class="row"><button class="primary" onclick="location.hash=\'#/cards/decks\'">选卡组</button>' +
      '<span class="muted">到期 ' + dueC + ' 张</span></div></section>' +
      '<section class="block"><h3 class="sec">❓ 自测问答与自查清单</h3>' +
      '<div class="row wrap"><button onclick="location.hash=\'#/cards/qa\'">问答（' + (D.selfcheck ? D.selfcheck.subjects.reduce(function (a, s) { return a + s.chapters.reduce(function (b, c) { return b + c.qas.length; }, 0); }, 0) : 0) + ' 组）</button>' +
      '<button onclick="location.hash=\'#/cards/check\'">自查清单（500 条）</button></div></section>';
  }

  /* ---------- 单词会话（艾宾浩斯：到期复习词优先 + 新词补足每日总量） ---------- */
  var wordQueue = [], wordMix = { due: 0, fresh: 0 };
  function buildWordQueue() {
    var ws = D.words ? D.words.words : [];
    var s = P.settings;
    var due = [], fresh = [];
    ws.forEach(function (w) {
      var e = P.words[w.sid];
      if (e && S.isDue(e)) due.push(w);
    });
    due.sort(function (a, b) { return (P.words[a.sid].d || '9999') < (P.words[b.sid].d || '9999') ? -1 : 1; });
    var need = Math.max(0, s.dailyWords - due.length);
    for (var i = 0; i < ws.length && fresh.length < need; i++) {
      if (!P.words[ws[i].sid]) fresh.push(ws[i]);
    }
    wordQueue = due.concat(fresh);
    wordMix = { due: due.length, fresh: fresh.length };
  }
  function renderWordsSession(q) {
    setTopBack('背卡');
    buildWordQueue();
    if (!wordQueue.length) { page.innerHTML = '<div class="empty">今日单词任务完成 🎉<br><span class="muted">到期复习与新词都已练完，明天再来</span></div>'; return; }
    var i = 0;
    function draw() {
      if (i >= wordQueue.length) {
        S.bumpLog('words', wordQueue.length);
        page.innerHTML = '<div class="empty">本轮完成！共 ' + wordQueue.length + ' 词 🎉<br>' +
          '<span class="muted">没记住的词已进生词本，艾宾浩斯复习按 1/2/4/7/15 天自动排期</span></div>';
        return;
      }
      var w = wordQueue[i];
      var e = P.words[w.sid];
      var stageTag = e && e.n ? '　<span class="tag ' + (S.ebDone(e) ? 'g' : 'a') + '">' +
        (S.ebDone(e) ? '已掌握' : '复习 ' + (S.ebStage(e) + 1) + '/' + S.EB_STAGES.length) + '</span>' : '　<span class="tag gray">新词</span>';
      var inBook = P.wordbook[w.sid] ? '　<span class="tag r">生词本</span>' : '';
      page.innerHTML = '<div class="qcount" style="margin-bottom:6px">' + (i + 1) + ' / ' + wordQueue.length +
        '（复习 ' + wordMix.due + ' + 新词 ' + wordMix.fresh + '）<span class="tag gray">词频 ' + w.freq + '</span>' + stageTag + inBook + '</div>' +
        '<div class="flip-wrap"><div class="flip" id="wc"><div class="face">' +
        '<span class="label">' + w.pos + '</span><div class="front-main" style="font-size:30px">' + esc(w.word) + '</div>' +
        '<div class="front-sub">' + esc(w.phonetic) + '</div><div class="tap-hint">先回想词义，点击任意处查看</div></div>' +
        '<div class="face back"><span class="label right">' + esc(w.word) + '</span>' +
        '<div style="margin-top:34px;text-align:center"><div style="font-size:15px">' + esc(w.meaning) + '</div>' +
        '<div class="muted" style="margin-top:10px">真题出现 ' + w.freq + ' 次 · 正确选项 ' + w.opt + ' 次</div></div></div></div></div>' +
        '<div class="ratebar locked" id="wrate"><button class="red" onclick="window.__rateWord(\'bad\')">❌ 不会</button>' +
        '<button class="amber" onclick="window.__rateWord(\'fuzzy\')">⚠️ 模糊</button>' +
        '<button class="green" onclick="window.__rateWord(\'good\')">✅ 认识</button></div>' +
        '<div class="muted center" id="whint" style="margin-top:8px">❌ 重置到第 1 天 ｜ ⚠️ 明天再练 ｜ ✅ 进入下一间隔（1→2→4→7→15 天）</div>';
      var f = $('#wc'), bar = $('#wrate'), hint = $('#whint');
      function flip() {
        if (!f.classList.contains('flipped')) {
          f.classList.add('flipped');
          bar.classList.remove('locked');
          hint.textContent = '第一次没记住（❌/⚠️）会自动加入生词本';
        }
      }
      f.onclick = flip;                        // 点卡片任意处 → 看词义
      window.__rateWord = function (r) {
        if (!f.classList.contains('flipped')) { flip(); return; }  // 未看词义：任何按钮都先展示词义
        S.rateWord(w.sid, r);
        S.bumpLog('words');
        i++; draw();
      };
    }
    draw();
  }

  /* ---------- 知识卡组 ---------- */
  function renderDecks() {
    setTopBack('背卡');
    var bySub = {};
    (D.cards ? D.cards.decks : []).forEach(function (dk, i) {
      (bySub[dk.subject] = bySub[dk.subject] || []).push(Object.assign({ idx: i }, dk));
    });
    var html = '';
    Object.keys(bySub).forEach(function (sub) {
      html += '<section class="block"><h3 class="sec">' + esc(sub) + '</h3>' + bySub[sub].map(function (dk) {
        var due = dk.cards.filter(function (c, ci) { return S.isDue(P.cards[dk.idx + '#' + ci]); }).length;
        return '<div class="s" style="display:flex;gap:8px;padding:9px 2px;border-bottom:1px solid var(--line);cursor:pointer" onclick="location.hash=\'#/cards/deck?' + dk.idx + '\'">' +
          '<span style="flex:1;font-size:14.5px">' + esc(dk.chapter) + '</span>' +
          '<span class="tag gray">' + dk.cards.length + ' 张</span>' + (due ? '<span class="tag a">到期 ' + due + '</span>' : '') + '</div>';
      }).join('') + '</section>';
    });
    page.innerHTML = html || '<div class="empty">无卡组</div>';
  }
  function renderDeckSession(q) {
    setTopBack('卡组');
    var idx = +q.arg2 || +(q.deck || 0);
    var dk = D.cards.decks[idx];
    if (!dk) { page.innerHTML = '<div class="empty">无此卡组</div>'; return; }
    var queue = [];
    dk.cards.forEach(function (c, ci) {
      var id = idx + '#' + ci, e = P.cards[id];
      if (e && S.isDue(e)) queue.push({ id: id, c: c });
    });
    dk.cards.forEach(function (c, ci) {
      var id = idx + '#' + ci;
      if (!P.cards[id] && queue.length < Math.max(20, P.settings.dailyCards)) queue.push({ id: id, c: c });
    });
    queue = queue.slice(0, Math.max(queue.length, 0));
    var i = 0;
    function draw() {
      if (i >= queue.length) { S.bumpLog('cards', queue.length); page.innerHTML = '<div class="empty">本组完成！共 ' + queue.length + ' 张 🎉<br><button class="ghost" style="margin-top:10px" onclick="location.hash=\'#/cards/decks\'">返回卡组</button></div>'; return; }
      var it = queue[i];
      page.innerHTML = '<div class="qcount" style="margin-bottom:6px">' + esc(dk.chapter) + ' · ' + (i + 1) + ' / ' + queue.length + '</div>' +
        '<div class="flip-wrap"><div class="flip" id="kc"><div class="face">' +
        '<span class="label">' + esc(dk.subject) + '</span><div class="front-main">' + mdInline(it.c.front) + '</div>' +
        '<div class="tap-hint">点击看一句话记忆</div></div>' +
        '<div class="face back"><span class="label right">答案</span><div class="mdview" style="margin-top:30px;font-size:15px;text-align:center">' + mdInline(it.c.back) + '</div></div></div></div>' +
        '<div class="ratebar"><button class="red" onclick="window.__rk(\'bad\')">❌ 想不起</button>' +
        '<button class="amber" onclick="window.__rk(\'fuzzy\')">⚠️ 模糊</button>' +
        '<button class="green" onclick="window.__rk(\'good\')">✅ 记得</button></div>';
      var f = $('#kc'); f.onclick = function () { f.classList.toggle('flipped'); };
      window.__rk = function (r) { S.rate(P.cards, it.id, r); S.bumpLog('cards'); i++; draw(); };
    }
    draw();
  }

  /* ---------- 408 随机速记（科目-章节范围选择 + 混排打乱；先回想，点任意按钮揭示内容再评分） ---------- */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  var K408_ALL = function () { return { sub: '全部', chap: '全部' }; };
  function k408Pool(scope) {
    scope = scope || K408_ALL();
    var due = [], rest = [];
    (D.cards ? D.cards.decks : []).forEach(function (dk, di) {
      if ((dk.file || '').indexOf('408/') !== 0) return;   // 只取 408 四科速记表
      var sub = dk.file.split('/')[1] || '';
      if (scope.sub !== '全部' && sub !== scope.sub) return;
      if (scope.chap !== '全部' && dk.chapter !== scope.chap) return;
      dk.cards.forEach(function (c, ci) {
        var id = di + '#' + ci, e = P.cards[id];
        var it = { id: id, c: c, src: sub + ' · ' + dk.chapter };
        if (e && S.isDue(e)) due.push(it); else rest.push(it);
      });
    });
    return { due: due, rest: rest };
  }
  function k408Stats(scope) {
    var p = k408Pool(scope);
    return { total: p.due.length + p.rest.length, due: p.due.length };
  }
  function k408Chapters(sub) {
    var chaps = [];
    (D.cards ? D.cards.decks : []).forEach(function (dk) {
      if ((dk.file || '').indexOf('408/') !== 0) return;
      if (dk.file.split('/')[1] !== sub) return;
      if (chaps.indexOf(dk.chapter) < 0) chaps.push(dk.chapter);
    });
    return chaps.sort(function (a, b) { return a.localeCompare(b, 'zh', { numeric: true }); });
  }

  /* 范围选择页：科目 chips → 章节 chips（选具体科目后出现），选择持久化 */
  function renderK408() {
    setTopBack('背卡');
    var scope = P.settings.k408Scope || K408_ALL();
    P.settings.k408Scope = scope;
    var subs = ['全部'];
    (D.cards ? D.cards.decks : []).forEach(function (dk) {
      if ((dk.file || '').indexOf('408/') !== 0) return;
      var s = dk.file.split('/')[1];
      if (subs.indexOf(s) < 0) subs.push(s);
    });
    var subChips = subs.map(function (s) {
      var st = k408Stats({ sub: s, chap: '全部' });
      return '<button class="' + (scope.sub === s ? 'on' : '') + '" data-ksub="' + esc(s) + '">' + esc(s) + ' ' + st.total + '</button>';
    }).join('');
    var chapHtml;
    if (scope.sub !== '全部') {
      var chapChips = '<button class="' + (scope.chap === '全部' ? 'on' : '') + '" data-kchap="全部">全部章节</button>' +
        k408Chapters(scope.sub).map(function (c) {
          var st = k408Stats({ sub: scope.sub, chap: c });
          return '<button class="' + (scope.chap === c ? 'on' : '') + '" data-kchap="' + esc(c) + '">' + esc(c) + ' ' + st.total + '</button>';
        }).join('');
      chapHtml = '<div class="muted" style="margin:12px 0 6px">章节</div><div class="subtabs" style="flex-wrap:wrap">' + chapChips + '</div>';
    } else {
      chapHtml = '<div class="muted" style="margin-top:10px">↑ 选具体科目后可再选章节</div>';
    }
    var st = k408Stats(scope);
    page.innerHTML =
      '<section class="block"><h3 class="sec">🎲 408 随机速记<span class="hint">先回想再揭示 · 不会/模糊重现更早</span></h3>' +
      '<div class="muted" style="margin-bottom:6px">科目</div><div class="subtabs">' + subChips + '</div>' + chapHtml +
      '<div class="row" style="margin-top:14px"><button class="primary" id="k408go">开始刷题</button>' +
      '<span class="muted">当前范围 ' + st.total + ' 个 · 到期 ' + st.due + ' · 每轮 ' + P.settings.dailyCards + '</span></div></section>';
    page.querySelectorAll('[data-ksub]').forEach(function (b) {
      b.onclick = function () {
        P.settings.k408Scope = { sub: b.dataset.ksub, chap: '全部' };
        S.saveP();
        renderK408();
      };
    });
    page.querySelectorAll('[data-kchap]').forEach(function (b) {
      b.onclick = function () {
        scope.chap = b.dataset.kchap;
        S.saveP();
        renderK408();
      };
    });
    $('#k408go').onclick = function () { runK408Session(scope); };
    window.__kAgain = renderK408;
  }

  function runK408Session(scope) {
    var p = k408Pool(scope);
    var n = P.settings.dailyCards;
    shuffle(p.rest);
    var queue = p.due.slice(0, n);                    // 到期重现优先
    if (queue.length < n) queue = queue.concat(p.rest.slice(0, n - queue.length));
    shuffle(queue);                                   // 整轮再打乱
    if (!queue.length) { page.innerHTML = '<div class="empty">当前范围没有可刷的知识点<br><button class="ghost" style="margin-top:10px" onclick="window.__kAgain()">换个范围</button></div>'; return; }
    var i = 0;
    function draw() {
      if (i >= queue.length) {
        S.bumpLog('cards', queue.length);
        page.innerHTML = '<div class="empty">本轮完成！共 ' + queue.length + ' 个知识点 🎉<br>' +
          '<button class="primary" style="margin-top:10px" onclick="window.__kAgain2()">再来一轮</button> ' +
          '<button class="ghost" style="margin-top:10px" onclick="window.__kAgain()">换范围 / 返回</button></div>';
        return;
      }
      var it = queue[i];
      page.innerHTML = '<div class="qcount" style="margin-bottom:6px">408 随机 · ' + (i + 1) + ' / ' + queue.length +
        '　<span class="tag gray">' + esc(it.src) + '</span></div>' +
        '<div class="flip-wrap"><div class="flip" id="k408c"><div class="face">' +
        '<span class="label">' + esc(it.src) + '</span>' +
        '<div class="front-main" style="font-size:19px">' + mdInline(it.c.front) + '</div>' +
        '<div class="tap-hint">先回想一句话记忆，点击任意处查看</div></div>' +
        '<div class="face back"><span class="label right">' + esc(it.src) + '</span>' +
        '<div class="mdview" style="margin-top:30px;font-size:15.5px;text-align:center">' + mdInline(it.c.back) + '</div></div></div></div>' +
        '<div class="ratebar locked" id="k408rate"><button class="red" onclick="window.__kk(\'bad\')">❌ 不会</button>' +
        '<button class="amber" onclick="window.__kk(\'fuzzy\')">⚠️ 模糊</button>' +
        '<button class="green" onclick="window.__kk(\'good\')">✅ 熟悉</button></div>' +
        '<div class="muted center" id="k408hint" style="margin-top:8px">点任何按钮先揭示内容，再点一次确认评分；不会/模糊的重现更早，熟悉的按 3/7 天巩固</div>';
      var f = $('#k408c'), bar = $('#k408rate');
      function flip() {
        if (!f.classList.contains('flipped')) { f.classList.add('flipped'); bar.classList.remove('locked'); }
      }
      f.onclick = flip;
      window.__kk = function (r) {
        if (!f.classList.contains('flipped')) { flip(); return; }   // 未揭示：先展示内容
        S.rate(P.cards, it.id, r);
        S.bumpLog('cards');
        i++; draw();
      };
    }
    draw();
    window.__kAgain2 = function () { runK408Session(scope); };      // 同范围重新抽卡打乱
  }

  /* ---------- 自查问答 ---------- */
  function renderQaList() {
    setTopBack('背卡');
    var html = '';
    (D.selfcheck ? D.selfcheck.subjects : []).forEach(function (sub, si) {
      html += '<section class="block"><h3 class="sec">' + esc(sub.group + ' · ' + sub.subject) + '</h3>';
      sub.chapters.forEach(function (ch, ci) {
        html += '<div class="s" style="display:flex;gap:8px;padding:9px 2px;border-bottom:1px solid var(--line);cursor:pointer" onclick="location.hash=\'#/cards/qalist?' + si + '.' + ci + '\'">' +
          '<span style="flex:1;font-size:14.5px">' + esc(ch.chapter) + '</span><span class="tag gray">' + ch.qas.length + ' 问</span></div>';
      });
      html += '</section>';
    });
    page.innerHTML = html || '<div class="empty">无数据</div>';
  }
  function renderQaSession(q) {
    setTopBack('问答');
    var m = (q.arg2 || q.ch || '0.0').split('.');
    var sub = D.selfcheck.subjects[+m[0]], ch = sub.chapters[+m[1]];
    var i = 0;
    function draw() {
      if (i >= ch.qas.length) { page.innerHTML = '<div class="empty">本章问答完成 🎉<br><button class="ghost" style="margin-top:10px" onclick="location.hash=\'#/cards/qa\'">返回</button></div>'; return; }
      var qa = ch.qas[i], id = m[0] + '.' + m[1] + '.' + qa.num;
      page.innerHTML = '<div class="qcount" style="margin-bottom:6px">' + esc(ch.chapter) + ' · Q' + qa.num + '（' + (i + 1) + '/' + ch.qas.length + '）</div>' +
        '<div class="flip-wrap"><div class="flip" id="qq"><div class="face">' +
        '<span class="label">' + esc(sub.subject) + '</span><div class="front-main" style="font-size:17px;text-align:left">' + mdInline('**' + qa.q.replace(/\n+/g, ' ') + '**') + '</div>' +
        '<div class="tap-hint">先自己作答，点击看答案</div></div>' +
        '<div class="face back"><span class="label right">答案</span><div class="mdview" style="margin-top:26px;font-size:14.5px">' + mdInline(qa.a) + '</div></div></div></div>' +
        '<div class="ratebar"><button class="red" onclick="window.__rq(\'bad\')">❌ 不会</button>' +
        '<button class="amber" onclick="window.__rq(\'fuzzy\')">⚠️ 模糊</button>' +
        '<button class="green" onclick="window.__rq(\'good\')">✅ 答对</button></div>';
      var f = $('#qq'); f.onclick = function () { f.classList.toggle('flipped'); };
      window.__rq = function (r) { S.rate(P.qa, id, r); S.bumpLog('qa'); i++; draw(); };
    }
    draw();
  }

  /* ---------- 生词本 ---------- */
  function wordBySid(sid) {
    var ws = D.words ? D.words.words : [];
    for (var i = 0; i < ws.length; i++) if (ws[i].sid === sid) return ws[i];
    return null;
  }
  function renderWordbook() {
    setTopBack('背卡');
    var sids = Object.keys(P.wordbook);
    if (!sids.length) {
      page.innerHTML = '<section class="block"><h3 class="sec">📕 生词本</h3>' +
        '<div class="empty">生词本还是空的<br><span class="muted">背词时第一次评"❌ 不会 / ⚠️ 模糊"的词会自动收进来</span></div></section>';
      return;
    }
    var done = 0, rows = '';
    sids.forEach(function (sid) {
      var w = wordBySid(sid);
      if (!w) return;
      var e = P.words[sid];
      var ok = S.ebDone(e);
      if (ok) done++;
      rows += '<div class="w"><span class="wd">' + esc(w.word) + '</span>' +
        '<span class="ph">' + esc(w.phonetic) + '</span>' +
        '<span class="mn">' + esc(w.meaning) + '</span>' +
        '<span class="lv">' + (ok ? '<span class="tag g">已掌握</span>' :
          '<span class="tag a">复习 ' + (S.ebStage(e) + 1) + '/' + S.EB_STAGES.length + '</span>') +
        ' <button class="ghost" style="padding:2px 8px;font-size:11px" data-rm="' + sid + '">移除</button></span></div>';
    });
    page.innerHTML = '<section class="block"><h3 class="sec">📕 生词本<span class="hint">' +
      sids.length + ' 词 · 已掌握 ' + done + '</span></h3>' +
      '<div class="row" style="margin-bottom:10px"><button class="primary" onclick="location.hash=\'#/cards/wbtrain\'">生词特训</button>' +
      '<span class="muted">优先练未掌握的词，评分与艾宾浩斯排期同步</span></div>' +
      '<div class="wordlist">' + rows + '</div></section>';
    page.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        delete P.wordbook[b.dataset.rm];
        S.saveP();
        renderWordbook();
      };
    });
  }
  function renderWbTrain() {
    setTopBack('生词本');
    var sids = Object.keys(P.wordbook).filter(function (sid) { return !S.ebDone(P.words[sid]); });
    if (!sids.length) { page.innerHTML = '<div class="empty">生词本里的词都掌握了 🎉</div>'; return; }
    var queue = sids.slice(0, 50).map(wordBySid).filter(Boolean);
    var i = 0;
    function draw() {
      if (i >= queue.length) { S.bumpLog('words', queue.length); page.innerHTML = '<div class="empty">特训完成！共 ' + queue.length + ' 词 🎉<br><button class="ghost" style="margin-top:10px" onclick="location.hash=\'#/cards/wordbook\'">返回生词本</button></div>'; return; }
      var w = queue[i];
      page.innerHTML = '<div class="qcount" style="margin-bottom:6px">生词特训 · ' + (i + 1) + ' / ' + queue.length + '</div>' +
        '<div class="flip-wrap"><div class="flip" id="tc"><div class="face">' +
        '<span class="label">📕 生词本</span><div class="front-main" style="font-size:30px">' + esc(w.word) + '</div>' +
        '<div class="front-sub">' + esc(w.phonetic) + '</div><div class="tap-hint">先回想词义，点击任意处查看</div></div>' +
        '<div class="face back"><span class="label right">' + esc(w.word) + '</span>' +
        '<div style="margin-top:34px;text-align:center"><div style="font-size:15px">' + esc(w.meaning) + '</div>' +
        '<div class="muted" style="margin-top:10px">真题出现 ' + w.freq + ' 次</div></div></div></div></div>' +
        '<div class="ratebar locked" id="trate"><button class="red" onclick="window.__rt(\'bad\')">❌ 不会</button>' +
        '<button class="amber" onclick="window.__rt(\'fuzzy\')">⚠️ 模糊</button>' +
        '<button class="green" onclick="window.__rt(\'good\')">✅ 认识</button></div>';
      var f = $('#tc'), bar = $('#trate');
      function flip() {
        if (!f.classList.contains('flipped')) { f.classList.add('flipped'); bar.classList.remove('locked'); }
      }
      f.onclick = flip;
      window.__rt = function (r) {
        if (!f.classList.contains('flipped')) { flip(); return; }
        S.rateWord(w.sid, r); S.bumpLog('words'); i++; draw();
      };
    }
    draw();
  }

  /* ---------- 三态自查清单 ---------- */
  function renderChecklist() {
    setTopBack('背卡');
    var html = '';
    (D.selfcheck ? D.selfcheck.subjects : []).forEach(function (sub, si) {
      sub.chapters.forEach(function (ch, ci) {
        var done = ch.items.filter(function (_, ii) { return P.checklist[si + '.' + ci + '.' + ii] === 1; }).length;
        html += '<details class="block" style="background:#fff;border-radius:14px;padding:10px 14px;margin-bottom:10px"><summary style="cursor:pointer;font-weight:600;font-size:15px">' +
          esc(sub.subject + ' · ' + ch.chapter) + '　<span class="tag ' + (done === ch.items.length ? 'g' : 'gray') + '">' + done + '/' + ch.items.length + '</span></summary><div style="margin-top:6px">';
        ch.items.forEach(function (it, ii) {
          var v = P.checklist[si + '.' + ci + '.' + ii] || 0;
          html += '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="mdview" style="font-size:14px">' + mdInline(it) + '</div>' +
            '<div class="tri" style="margin-top:6px" data-cl="' + si + '.' + ci + '.' + ii + '">' +
            '<b class="' + (v === 1 ? 'on-1' : '') + '" data-v="1">✅ 会</b>' +
            '<b class="' + (v === 2 ? 'on-2' : '') + '" data-v="2">⚠️ 模糊</b>' +
            '<b class="' + (v === 3 ? 'on-3' : '') + '" data-v="3">❌ 不会</b></div></div>';
        });
        html += '</div></details>';
      });
    });
    page.innerHTML = html || '<div class="empty">无数据</div>';
  }
  page.addEventListener('click', function (ev) {
    var b = ev.target.closest('.tri b[data-v]');
    if (!b) return;
    var tri = b.closest('.tri'), key = tri.dataset.cl;
    P.checklist[key] = +b.dataset.v;
    S.saveP();
    tri.querySelectorAll('b').forEach(function (x) { x.className = ''; });
    b.className = 'on-' + b.dataset.v;
  });

  /* ================= 错题 ================= */
  function renderQuizHub() {
    setTopBack('');
    var subs = {};
    (D.quiz ? D.quiz.sections : []).forEach(function (s) {
      (subs[s.subject] = subs[s.subject] || { n: 0, done: 0, secs: [] });
      subs[s.subject].n += s.questions.length + s.freeform.length;
      subs[s.subject].done += s.questions.filter(function (q) { return P.quiz[s.subject + '|' + s.section + '|' + q.num]; }).length;
      subs[s.subject].secs.push(s);
    });
    var html = '';
    Object.keys(subs).forEach(function (name) {
      var v = subs[name];
      html += '<section class="block"><h3 class="sec">' + esc(name) + '<span class="hint">已做 ' + v.done + '/' + v.n + '</span></h3>' +
        '<div class="seclist">' + v.secs.map(function (s, i) {
          var idx = D.quiz.sections.indexOf(s);
          var nq = s.questions.length + s.freeform.length;
          var done = s.questions.filter(function (q) { return P.quiz[name + '|' + s.section + '|' + q.num]; }).length;
          return '<div class="s" onclick="location.hash=\'#/quiz/sec?' + idx + '\'"><span class="st">' + esc(s.section) + '</span>' +
            (s.freeform.length ? '<span class="tag a">综合 ' + s.freeform.length + '</span>' : '') +
            '<span class="tag ' + (done === nq ? 'g' : 'gray') + '">' + done + '/' + nq + '</span></div>';
        }).join('') + '</div></section>';
    });
    page.innerHTML = html || '<div class="empty">无数据</div>';
  }

  function renderQuizSection(q) {
    setTopBack('错题');
    var idx = +q.arg2 || +(q.sec || 0);
    var sec = D.quiz.sections[idx];
    if (!sec) { page.innerHTML = '<div class="empty">无此小节</div>'; return; }
    var items = sec.questions.map(function (qq) { return { type: 'mc', q: qq }; })
      .concat(sec.freeform.map(function (qq) { return { type: 'free', q: qq }; }));
    var i = 0;
    function draw() {
      if (i >= items.length) {
        S.bumpLog('quiz', items.length);
        page.innerHTML = '<div class="empty">本节完成！共 ' + items.length + ' 题 🎉<br><button class="ghost" style="margin-top:10px" onclick="location.hash=\'#/quiz\'">返回</button></div>';
        return;
      }
      var it = items[i], id = sec.subject + '|' + sec.section + '|' + it.q.num;
      var head = '<div class="qcount" style="margin-bottom:6px">' + esc(sec.subject + ' · ' + sec.section) + ' · ' + (i + 1) + '/' + items.length +
        (it.type === 'free' ? '　<span class="tag a">综合应用题</span>' : '') + '</div>';
      if (it.type === 'free') {
        page.innerHTML = head +
          '<div class="mdview q-stem" style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(30,40,60,.05)">' + mdInline('**' + it.q.stem + '**') + '</div>' +
          '<div id="freeans" style="display:none"><div class="ansbox"><div class="key">答（一句话版）</div><div class="mdview">' + mdInline(it.q.answer || '（见要点）') + '</div>' +
          (it.q.detail && it.q.detail.length ? '<details class="entries-fold"><summary>展开要点与解析</summary><div class="mdview" style="font-size:13.5px">' + it.q.detail.map(function (x) { return mdInline('- ' + x); }).join('') + '</div></details>' : '') + '</div></div>' +
          '<div class="qnav"><button class="primary" id="freebtn" onclick="window.__free()">看答案</button></div>' +
          '<div class="ratebar" id="freerate" style="display:none"><button class="red" onclick="window.__rf(\'bad\')">❌ 不会</button>' +
          '<button class="amber" onclick="window.__rf(\'fuzzy\')">⚠️ 模糊</button><button class="green" onclick="window.__rf(\'good\')">✅ 答对</button></div>';
        window.__free = function () { $('#freeans').style.display = 'block'; $('#freebtn').style.display = 'none'; $('#freerate').style.display = 'flex'; };
        window.__rf = function (r) { S.rate(P.quiz, id, r); S.bumpLog('quiz'); i++; draw(); };
        return;
      }
      var qq = it.q;
      var opts = Object.keys(qq.options).sort().map(function (k) {
        return '<button class="opt" data-k="' + k + '" onclick="window.__ans(\'' + k + '\')"><span class="ol">' + k + '.</span>' + mdInline(qq.options[k]) + '</button>';
      }).join('');
      page.innerHTML = head +
        '<div class="mdview q-stem" style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(30,40,60,.05)">' + mdInline(qq.stem) + '</div>' +
        '<div id="opts">' + opts + '</div>' +
        '<div id="result"></div><div class="qnav" id="qnav" style="display:none"><span class="qcount"></span><button class="primary" onclick="window.__next()">下一题 ›</button></div>';
      window.__ans = function (k) {
        var right = qq.mode !== 'multi' ? k === qq.key : null;
        document.querySelectorAll('#opts .opt').forEach(function (b) {
          b.disabled = true;
          var kk = b.dataset.k;
          if (qq.mode !== 'multi') {
            if (kk === qq.key) b.classList.add('right');
            else if (kk === k) b.classList.add('wrong');
          } else b.disabled = false;
        });
        var res = $('#result');
        if (qq.mode === 'multi') {
          res.innerHTML = '<div class="ansbox"><div class="key">参考答案：' + esc(qq.answer) + '</div><div class="muted">多空题请对照自评</div>' +
            (sec.entries.length ? '<details class="entries-fold"><summary>本节漏洞要点（' + sec.entries.length + ' 条）</summary><div class="mdview" style="font-size:13.5px">' + sec.entries.map(function (x) { return mdInline('- **' + x + '**'); }).join('') + '</div></details>' : '') + '</div>' +
            '<div class="ratebar"><button class="red" onclick="S.rate(P.quiz,\'' + id + '\',\'bad\');window.__next()">❌ 错了</button><button class="green" onclick="S.rate(P.quiz,\'' + id + '\',\'good\');window.__next()">✅ 对了</button></div>';
        } else {
          var ok = right;
          res.innerHTML = '<div class="ansbox"><div class="key" style="color:' + (ok ? 'var(--green)' : 'var(--red)') + '">' + (ok ? '✓ 回答正确' : '✗ 回答错误') + '　答案：' + esc(qq.answer) + '</div>' +
            (sec.entries.length ? '<details class="entries-fold"><summary>本节漏洞要点（' + sec.entries.length + ' 条）</summary><div class="mdview" style="font-size:13.5px">' + sec.entries.map(function (x) { return mdInline('- **' + x + '**'); }).join('') + '</div></details>' : '') + '</div>';
          $('#qnav').style.display = 'flex';
          S.rate(P.quiz, id, ok ? 'good' : 'bad');
          S.bumpLog('quiz');
        }
        window.__next = function () { i++; draw(); };
      };
    }
    draw();
  }

  /* ================= 笔记 ================= */
  var noteScroll = {};
  function renderNotes() {
    setTopBack('');
    S.ensureLazy('manifest.json');
    S.ensureLazy('notes.json').then(function () {
      var tree = buildTree();
      var subjChips = (D.manifest ? D.manifest.subjects : []).map(function (s, i) {
        return '<button class="' + (i === 0 ? 'on' : '') + '" data-sub="' + i + '">' + s.icon + ' ' + esc(s.name) + '</button>';
      }).join('');
      page.innerHTML =
        '<section class="block"><input type="text" id="nsearch" placeholder="搜索全部笔记正文…（公式不支持）">' +
        '<div class="subtabs" style="margin-top:8px">' + subjChips + '</div><div id="nresult"></div></section>' +
        '<section class="block" id="ntree">' + tree + '</section>';
      var curSub = 0;
      document.querySelectorAll('[data-sub]').forEach(function (b) {
        b.onclick = function () {
          curSub = +b.dataset.sub;
          document.querySelectorAll('[data-sub]').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          $('#ntree').innerHTML = subTree(curSub);
          bindTree();
        };
      });
      bindTree();
      var st = null;
      $('#nsearch').oninput = function () {
        var v = this.value.trim();
        clearTimeout(st);
        if (v.length < 2) { $('#nresult').innerHTML = ''; return; }
        st = setTimeout(function () { doSearch(v, curSub); }, 350);
      };
    });
  }
  function buildTree() { return subTree(0); }
  function subTree(i) {
    var s = D.manifest && D.manifest.subjects[i];
    if (!s) return '<div class="empty">目录数据未加载</div>';
    return s.children.map(function (c, ci) { return treeNode(c, 's' + i + '-'); }).join('');
  }
  function treeNode(n, prefix) {
    if (n.path) {
      return '<div class="node" data-path="' + esc(n.path) + '"><span class="arr" style="visibility:hidden">▸</span><span>📄</span><span>' + esc(n.name) + '</span></div>';
    }
    return '<div class="node folder" data-f="' + esc(prefix + n.name) + '"><span class="arr">▸</span><span>📁</span><span>' + esc(n.name) + '</span></div>' +
      '<div class="kids">' + n.children.map(function (c) { return treeNode(c, prefix + n.name + '/'); }).join('') + '</div>';
  }
  function bindTree() {
    document.querySelectorAll('#ntree .node.folder').forEach(function (f) {
      f.onclick = function (ev) { ev.stopPropagation(); f.classList.toggle('open'); };
    });
    document.querySelectorAll('#ntree .node[data-path]').forEach(function (f) {
      f.onclick = function (ev) { ev.stopPropagation(); location.hash = '#/notes/view?' + encodeURIComponent(f.dataset.path); };
    });
  }
  function doSearch(v, curSub) {
    S.ensureLazy('search.json').then(function () {
      var subs = D.manifest ? D.manifest.subjects.map(function (x) { return x.name; }) : [];
      var want = subs[curSub];
      var out = [];
      (D.search ? D.search.pages : []).forEach(function (pg) {
        if (want && pg.subject !== want) return;
        var idx = pg.text.indexOf(v);
        if (idx < 0 && pg.title.indexOf(v) < 0) return;
        var frag = idx >= 0 ? pg.text.slice(Math.max(0, idx - 22), idx + 40) : pg.text.slice(0, 50);
        out.push({ pg: pg, frag: frag });
      });
      out.sort(function (a, b) { return a.pg.title.indexOf(v) >= 0 ? -1 : 1; });
      $('#nresult').innerHTML = out.length
        ? out.slice(0, 40).map(function (o) {
          return '<div class="search-item" data-path="' + esc(o.pg.path) + '"><div class="t">' + esc(o.pg.title) + '</div>' +
            '<div class="x">…' + esc(o.frag).replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<mark>' + esc(v) + '</mark>') + '…</div></div>';
        }).join('') + (out.length > 40 ? '<div class="muted center" style="padding:8px">仅显示前 40 条 / 共 ' + out.length + ' 条</div>' : '')
        : '<div class="empty">无结果</div>';
      document.querySelectorAll('#nresult .search-item').forEach(function (el) {
        el.onclick = function () { location.hash = '#/notes/view?' + encodeURIComponent(el.dataset.path); };
      });
    });
  }

  function renderNoteView(q) {
    var path = q.arg2 || q.path || '';
    path = decodeURIComponent(path);
    setTopBack('笔记');
    S.ensureLazy('notes.json').then(function () {
      var raw = D.notes && D.notes[path];
      var box = document.createElement('div');
      box.className = 'block mdview';
      page.innerHTML = '';
      if (raw == null) {
        box.innerHTML = '<div class="empty">未找到笔记：' + esc(path) + '</div>';
        page.appendChild(box); return;
      }
      page.appendChild(box);
      Renderer.renderMarkdown(raw, box, { baseDir: path.replace(/[^/]*$/, '') });
    });
  }

  /* ================= 设置 ================= */
  function renderSettings() {
    setTopBack('');
    var metas = Object.keys(D._meta).map(function (f) {
      var m = D._meta[f];
      return '<span class="tag ' + (m.from === 'refresh' ? 'g' : 'gray') + '" style="margin:2px">' + f.replace('.json', '') + (m.from === 'refresh' ? ' ⟳' : '') + '</span>';
    }).join(' ');
    var ci = S.codeInfo();
    var codeDesc = ci.ov ? '在线更新版 ' + ci.ov.version : (ci.build ? '内置 v' + ci.build.v : '开发模式（浏览器直跑）');
    page.innerHTML =
      '<section class="block"><h3 class="sec">每日任务量</h3>' +
      '<div class="set-row"><span class="lab">每日单词量（复习 + 新词）</span><input type="number" id="set-w" min="5" max="200" value="' + P.settings.dailyWords + '"></div>' +
      '<div class="set-row"><span class="lab">错题练习目标 / 天</span><input type="number" id="set-q" min="5" max="100" value="' + P.settings.dailyQuiz + '"></div>' +
      '<div class="set-row"><span class="lab">知识卡片 / 天</span><input type="number" id="set-c" min="5" max="200" value="' + P.settings.dailyCards + '"></div>' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="set-save">保存</button></div></section>' +
      '<section class="block"><h3 class="sec">数据与代码</h3>' +
      '<div style="margin-bottom:8px">' + metas + '</div>' +
      '<div class="set-row"><span class="lab">应用代码</span><span class="muted" style="font-size:12.5px">' + codeDesc + '</span>' +
      '<button class="ghost" id="btn-code-reset" style="padding:4px 10px;font-size:12px">恢复内置</button></div>' +
      '<div class="row" style="margin-top:8px"><button class="primary" id="btn-update">检查更新</button><span class="muted" id="upd-stat"></span></div>' +
      '<p class="muted" style="margin-bottom:0">更新源：GitHub Pages + jsDelivr（自动择新）。笔记或应用代码变更后：电脑跑 extract_data.py → push.bat，这里点一下即可同步数据与代码，无需重装 APK。</p></section>' +
      '<section class="block"><h3 class="sec">进度备份</h3>' +
      '<div class="row wrap"><button id="btn-export">导出进度（JSON）</button>' +
      '<button id="btn-import">导入进度</button><input type="file" id="file-import" accept=".json" style="display:none">' +
      '<button class="red" id="btn-reset">清空全部进度</button></div></section>' +
      '<section class="block"><h3 class="sec">关于</h3><p class="muted" style="margin:0">考研复习 · 本地数据离线可用；正文渲染 marked + KaTeX（复用笔记站点管线）。' +
      '复习节奏：三档自评（会 / 模糊 / 不会）。单词按艾宾浩斯曲线（1→2→4→7→15 天，答错重置），卡片/问答/错题为 +1/+3/+7 天。</p></section>';

    $('#set-save').onclick = function () {
      P.settings.dailyWords = Math.max(5, +$('#set-w').value || 30);
      P.settings.dailyQuiz = Math.max(5, +$('#set-q').value || 20);
      P.settings.dailyCards = Math.max(5, +$('#set-c').value || 30);
      S.saveP(); toast('已保存');
    };
    $('#btn-update').onclick = function () {
      var el = $('#upd-stat'); el.textContent = '检查中…';
      S.checkUpdate(function (m) { toast(m); }).then(function (r) {
        if (r.codeUpdated) {
          el.textContent = '代码已更新：' + (r.code && r.code.version || '') + '，重启生效';
          toast('应用代码已更新，正在重启…');
          setTimeout(function () { location.reload(); }, 1000);
          return;
        }
        if (r.updated) { el.textContent = '数据已更新到 ' + r.version + '（' + r.files.length + ' 个文件）'; toast('数据已更新 ✓'); nav(); return; }
        if (r.err) { el.textContent = '检查失败（网络不通？）'; return; }
        el.textContent = '已是最新（' + (r.version || (r.code && r.code.version) || '?') + '）';
      }).catch(function (e) { el.textContent = '检查失败：' + e.message; });
    };
    $('#btn-code-reset').onclick = function () {
      localStorage.removeItem('kaoyan_code_v1');
      toast('已恢复内置代码，重启中…');
      setTimeout(function () { location.reload(); }, 700);
    };
    $('#btn-export').onclick = function () {
      var blob = new Blob([JSON.stringify(P)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kaoyan-progress-' + S.todayStr() + '.json';
      a.click();
    };
    $('#btn-import').onclick = function () { $('#file-import').click(); };
    $('#file-import').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var obj = JSON.parse(rd.result);
          localStorage.setItem('kaoyan_progress_v1', JSON.stringify(obj));
          toast('已导入，刷新中…');
          setTimeout(function () { location.reload(); }, 600);
        } catch (e) { toast('文件格式不对'); }
      };
      rd.readAsText(f);
    };
    $('#btn-reset').onclick = function () {
      if (confirm('确定清空全部学习进度？此操作不可恢复（建议先导出备份）。')) {
        localStorage.removeItem('kaoyan_progress_v1');
        location.reload();
      }
    };
  }

  /* ================= 启动 ================= */
  function start() {
    var sp = document.createElement('div');
    sp.id = 'splash';
    sp.innerHTML = '<div class="logo">📖</div><div class="t loading-dots">加载数据</div>';
    document.body.appendChild(sp);
    S.boot().then(function () {
      sp.remove();
      window.addEventListener('hashchange', nav);
      nav();
    });
  }
  start();
})();
