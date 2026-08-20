/* zoom.js — 点击图片放大查看（lightbox）
 *
 * 使用：在页面底部 <script src="zoom.js" defer></script>
 * 效果：.nav-content 内的任一张 <img> 点击后全屏放大查看
 *   · 滚轮 / +/- 键：以图片中心为锚点缩放（不偏向四角）
 *   · 拖拽：平移（放大时）
 *   · 单击图片：在“适应屏幕”和“100% 原始尺寸”之间切换
 *   · 双击图片：复位到适应屏幕
 *   · ← / → 键或两侧按钮：上一张 / 下一张
 *   · Esc / 点击背景 / ✕ 按钮：关闭
 * 小图禁用：给 <img> 加 data-no-zoom 属性即可跳过
 * 需配合 add_nav.py 注入的 dsz-* 前缀 CSS。
 */
(function () {
  'use strict';

  var isOpen = false;
  var images = [];            // [{src, alt}]
  var cur = -1;
  var scale = 1, baseW = 0, baseH = 0, tx = 0, ty = 0;
  var view = null, stage = null, imgEl = null, captionEl = null;
  var counterEl = null, hintEl = null;
  var drag = null, suppressClick = false;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* 收集当前页可放大的图片 */
  function collect() {
    var list = [];
    var host = document.querySelector('.nav-content') || document.body;
    var nodes = host.querySelectorAll('img');
    Array.prototype.forEach.call(nodes, function (im) {
      if (im.hasAttribute('data-no-zoom')) return;
      if (im.closest('a, button, .CodeMirror, canvas, svg')) return;
      var src = im.currentSrc || im.getAttribute('src') || '';
      if (!src) return;
      list.push({ src: src, alt: (im.getAttribute('alt') || '').trim() });
    });
    return list;
  }

  function build() {
    if (view) return;
    view = document.createElement('div');
    view.className = 'dsz-overlay';
    view.innerHTML =
      '<div class="dsz-stage"></div>' +
      '<button class="dsz-btn dsz-close" type="button" title="关闭 (Esc)">✕</button>' +
      '<button class="dsz-btn dsz-prev" type="button" title="上一张 (←)">‹</button>' +
      '<button class="dsz-btn dsz-next" type="button" title="下一张 (→)">›</button>' +
      '<div class="dsz-counter"></div>' +
      '<div class="dsz-caption"></div>' +
      '<div class="dsz-hint">滚轮缩放 · 拖拽移动 · Esc 关闭</div>';
    stage = view.querySelector('.dsz-stage');
    imgEl = document.createElement('img');
    imgEl.className = 'dsz-img';
    imgEl.alt = '';
    stage.appendChild(imgEl);

    captionEl = view.querySelector('.dsz-caption');
    counterEl = view.querySelector('.dsz-counter');
    hintEl = view.querySelector('.dsz-hint');
    document.body.appendChild(view);

    view.addEventListener('click', function (e) {
      if (e.target === view || e.target === stage) close();
    });
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    imgEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (suppressClick) { suppressClick = false; return; }
      toggleZoom();
    });
    imgEl.addEventListener('dblclick', function (e) { e.stopPropagation(); fit(); });
    view.querySelector('.dsz-close').addEventListener('click', function (e) {
      e.stopPropagation(); close();
    });
    view.querySelector('.dsz-prev').addEventListener('click', function (e) {
      e.stopPropagation(); show(cur - 1);
    });
    view.querySelector('.dsz-next').addEventListener('click', function (e) {
      e.stopPropagation(); show(cur + 1);
    });
  }

  function getOffsetX(s) { return (stage.clientWidth - baseW * s) / 2; }
  function getOffsetY(s) { return (stage.clientHeight - baseH * s) / 2; }

  function apply() {
    if (!imgEl) return;
    var w = baseW * scale, h = baseH * scale;
    /* 平移范围：图片小于视口时强制居中（范围=0）；放大到超出视口时，
       允许在保证图片覆盖视口的前提下平移 */
    var wr = Math.max(0, w - stage.clientWidth) / 2;
    var hr = Math.max(0, h - stage.clientHeight) / 2;
    tx = clamp(tx, -wr, wr);
    ty = clamp(ty, -hr, hr);
    imgEl.style.width = w + 'px';
    imgEl.style.height = h + 'px';
    imgEl.style.left = (getOffsetX(scale) + tx) + 'px';
    imgEl.style.top = (getOffsetY(scale) + ty) + 'px';
  }

  function fit() {
    if (!baseW || !baseH) return;
    scale = Math.min(1, stage.clientWidth * 0.92 / baseW,
                        stage.clientHeight * 0.85 / baseH);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    tx = 0; ty = 0;
    apply();
  }

  function toggleZoom() {
    var fitScale = Math.min(1, stage.clientWidth * 0.92 / baseW,
                               stage.clientHeight * 0.85 / baseH) || 1;
    if (Math.abs(scale - fitScale) < 0.015) {
      scale = 1; tx = 0; ty = 0; apply();       // 100% 原始尺寸
    } else {
      fit();
    }
  }

  /* 缩放：锚点固定在图片当前中心。
     （图片中心在屏幕上的 x = 视口中心 + tx，与 scale 无关，因此
      缩放时保持 tx/ty 不变即可让缩放围绕图片中心进行，不会偏向四角） */
  function zoomBy(f) {
    if (!isOpen) return;
    var newScale = clamp(scale * f, 0.2, 20);
    if (newScale === scale) return;
    scale = newScale;
    apply();
  }

  function onWheel(e) {
    e.preventDefault();
    if (!isOpen) return;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function onDown(e) {
    if (e.target !== imgEl) return;
    drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
  }
  function onMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) suppressClick = true;
    tx = drag.tx + dx; ty = drag.ty + dy;
    apply();
  }
  function onUp() { drag = null; }

  function onKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowLeft') { if (images.length > 1) show(cur - 1); }
    else if (e.key === 'ArrowRight') { if (images.length > 1) show(cur + 1); }
    else if (e.key === '+' || e.key === '=') { zoomBy(1.3); }
    else if (e.key === '-') { zoomBy(1 / 1.3); }
  }

  function show(i) {
    if (!images.length) return;
    if (i < 0) i = images.length - 1;
    if (i >= images.length) i = 0;
    cur = i;
    var item = images[cur];
    baseW = 0; baseH = 0;
    imgEl.style.opacity = 0;
    imgEl.src = item.src;
    imgEl.onload = function () {
      baseW = imgEl.naturalWidth || 1;
      baseH = imgEl.naturalHeight || 1;
      fit();
      imgEl.style.opacity = 1;
    };
    imgEl.onerror = function () { imgEl.style.opacity = 1; };
    captionEl.textContent = item.alt;
    captionEl.style.display = item.alt ? '' : 'none';
    counterEl.textContent = (cur + 1) + ' / ' + images.length;
    var multi = images.length > 1;
    view.querySelector('.dsz-prev').style.display = multi ? '' : 'none';
    view.querySelector('.dsz-next').style.display = multi ? '' : 'none';
  }

  function openFrom(src, alt) {
    build();
    images = collect();
    var idx = -1;
    for (var i = 0; i < images.length; i++) {
      if (images[i].src === src) { idx = i; break; }
    }
    if (idx === -1) {
      images.push({ src: src, alt: (alt || '').trim() });
      idx = images.length - 1;
    }
    show(idx);
    view.classList.add('dsz-on');
    document.body.classList.add('dsz-lock');
    isOpen = true;
  }

  function close() {
    if (!view) return;
    isOpen = false;
    view.classList.remove('dsz-on');
    document.body.classList.remove('dsz-lock');
    imgEl.src = '';
  }

  /* 全局代理点击（捕获阶段），只处理正文图片 */
  document.addEventListener('click', function (e) {
    var im = e.target;
    if (!im || im.tagName !== 'IMG') return;
    if (im.closest('.dsz-overlay')) return;
    if (!im.closest('.nav-content')) return;
    if (im.hasAttribute('data-no-zoom')) return;
    if (im.closest('a, button, .CodeMirror, canvas, svg')) return;
    var src = im.currentSrc || im.getAttribute('src');
    if (!src) return;
    e.preventDefault();
    openFrom(src, im.getAttribute('alt'));
  }, true);
})();
