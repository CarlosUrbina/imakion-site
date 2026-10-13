/* Imakion portfolio: scroll-linked motion, reveals, and the image lightbox.
   Motion rules: one moving thing at a time, slow easing, small distances,
   paced by the visitor's scroll. With reduced motion (or no JS) every
   section falls back to a still, fully usable layout. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var vh = window.innerHeight;
  var vw = document.documentElement.clientWidth;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var all = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };

  var hero = document.querySelector('.hero');
  var layers = all('.hero [data-depth]');
  var drifters = all('[data-parallax] img');
  var floats = reduce ? [] : all('[data-float]');
  var pans = reduce ? [] : all('[data-pan]');
  var strips = [];

  /* Screen strip: slides sideways with the page, loops, can be dragged -- */
  function setupStrip(sec) {
    var view = sec.querySelector('.strip-view');
    var track = sec.querySelector('.strip-track');
    var originals = [].slice.call(track.children);
    var n = originals.length;
    // Two extra copies make the loop seamless; copies are hidden from
    // screen readers and the keyboard.
    for (var k = 0; k < 2; k++) {
      originals.forEach(function (li) {
        var c = li.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        all('button', c).forEach(function (b) { b.tabIndex = -1; b.dataset.clone = '1'; });
        track.appendChild(c);
      });
    }
    sec.classList.add('is-linked');
    var s = { sec: sec, view: view, track: track, setW: 0, manual: 0, imgs: all('img', track) };
    s.measure = function () { s.setW = track.children[n].offsetLeft - track.children[0].offsetLeft; };
    s.measure();

    // Drag with mouse or finger (vertical swipes still scroll the page)
    var x0 = 0, m0 = 0, down = false, dragged = false;
    view.addEventListener('pointerdown', function (e) {
      down = true; dragged = false; x0 = e.clientX; m0 = s.manual;
    });
    view.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - x0;
      if (!dragged && Math.abs(dx) > 6) {
        dragged = true; view.classList.add('is-dragging');
        try { view.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (dragged) { s.manual = m0 - dx; render(s); }
    });
    var end = function () { down = false; view.classList.remove('is-dragging'); };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    // A drag should not open the lightbox
    view.addEventListener('click', function (e) {
      if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
    }, true);
    // Sideways trackpad gestures
    view.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); s.manual += e.deltaX; render(s); }
    }, { passive: false });
    // Keyboard: bring a focused screen into view
    view.addEventListener('focusin', function (e) {
      var r = e.target.getBoundingClientRect();
      if (r.left < 0 || r.right > vw) { s.manual += (r.left + r.width / 2) - vw / 2; render(s); }
    });
    var tb = all('.tape-btn', sec);
    tb.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = btn.classList.contains('tape-next') ? 1 : -1;
        var from = s.manual, to = from + dir * vw * 0.6, t0 = null;
        if (s.anim) cancelAnimationFrame(s.anim);
        function step(t) {
          if (t0 === null) t0 = t;
          var k = Math.min(1, (t - t0) / 520), e = 1 - Math.pow(1 - k, 3);
          s.manual = from + (to - from) * e; render(s);
          if (k < 1) s.anim = requestAnimationFrame(step);
        }
        s.anim = requestAnimationFrame(step);
      });
    });
    s.tape = sec.classList.contains('tape');
    strips.push(s);
  }

  function render(s) {
    if (!s.setW) return;
    var r = s.sec.getBoundingClientRect();
    var p = clamp((vh - r.top) / (vh + r.height), 0, 1);
    var travel = (parseFloat(s.sec.dataset.pace) || 2.2) * vw;                       // about two screens per pass
    var offset = p * travel + s.manual;
    var wrapped = ((offset % s.setW) + s.setW) % s.setW;
    var lead = 0.22 * vw;                        // first screen starts cut by the left edge
    s.track.style.transform = 'translate3d(' + (-(s.setW + wrapped - lead)).toFixed(1) + 'px,0,0)';
    // Focus: the screen passing the center is in full color, the rest ease to gray
    var mid = vw / 2;
    if (!s.tape || s.sec.dataset.focus) s.imgs.forEach(function (img) {
      var b = img.getBoundingClientRect();
      if (b.right < -50 || b.left > vw + 50) return;
      var d = Math.abs(b.left + b.width / 2 - mid) / mid;      // 0 at center, 1 at the edge
      var wide = s.sec.dataset.focus === 'wide';
      var color = clamp(1 - (d - (wide ? 0.5 : 0.16)) / (wide ? 0.4 : 0.5), 0, 1);
      img.style.filter = color >= 1 ? 'none' : 'grayscale(' + (1 - color).toFixed(3) + ')';
    });
  }

  /* Reveal window: image moves at a fraction of page speed ------------ */
  var reveals = [];
  var duos = all('.duo');
  var zoomIns = all('.zoomin').map(function (f) { return f.querySelector('.zoom'); }).filter(Boolean);
  function setupReveal(fig) {
    var speed = parseFloat(fig.dataset.reveal) || 0.25;
    fig.style.setProperty('--travel', (1 - speed).toFixed(3));
    fig.style.setProperty('--end', parseFloat(fig.dataset.end) || 0);
    fig.classList.add('is-linked');
    reveals.push({ fig: fig, img: fig.querySelector('img'), lag: 1 - speed });
  }
  function renderReveal(rv) {
    var r = rv.fig.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) return;
    // Scrolled distance since the window's top entered at the bottom of the
    // screen, until its bottom reaches the bottom of the screen.
    var p = clamp(vh - r.top, 0, r.height);
    rv.img.style.transform = 'translate3d(0,' + (p * rv.lag).toFixed(1) + 'px,0)';
  }

  /* Turntable: drag, swipe, arrow buttons or arrow keys turn through the
     views; they blend continuously while dragging, like rotating the object. */
  function setupTurntable(sec) {
    var stage = sec.querySelector('.tt-stage');
    var views = all('.walk-views li', sec);
    var dots = all('.tt-dot', sec);
    var status = sec.querySelector('.tt-status');
    var names = ['left', 'center', 'right'];
    var n = views.length, max = n - 1;
    var pos = clamp(parseInt(sec.dataset.start, 10) || 0, 0, max);
    var anim = null;
    sec.classList.add('is-turntable');
    sec.querySelector('.tt-controls').hidden = false;

    function paint(t) {
      views.forEach(function (li, i) {
        var o = clamp(1 - Math.abs(t - i), 0, 1);
        li.style.opacity = o.toFixed(3);
        li.style.zIndex = o > 0.5 ? 2 : 1;
        li.querySelector('button').tabIndex = Math.round(t) === i ? 0 : -1;
      });
      var on = Math.round(t);
      dots.forEach(function (d, i) { d.classList.toggle('is-on', i === on); });
    }
    function settle(target) {
      target = clamp(Math.round(target), 0, max);
      if (anim) cancelAnimationFrame(anim);
      var from = pos, t0 = null, dur = reduce ? 0 : 520;
      var ease = function (x) { return 1 - Math.pow(1 - x, 3); };
      function step(ts) {
        if (t0 === null) t0 = ts;
        var k = dur ? clamp((ts - t0) / dur, 0, 1) : 1;
        pos = from + (target - from) * ease(k);
        paint(pos);
        if (k < 1) anim = requestAnimationFrame(step);
        else { anim = null; pos = target; status.textContent = 'Showing the ' + (names[target] || (target + 1)) + ' view'; }
      }
      anim = requestAnimationFrame(step);
    }

    // Drag: one stage-width of travel turns through all the views
    var x0 = 0, p0 = 0, down = false, dragged = false;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      down = true; dragged = false; x0 = e.clientX; p0 = pos;
      if (anim) { cancelAnimationFrame(anim); anim = null; }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - x0;
      if (!dragged && Math.abs(dx) > 6) {
        dragged = true; stage.classList.add('is-dragging');
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (!dragged) return;
      // Dragging left brings the right side into view, like turning the object
      var t = clamp(p0 - dx / (stage.offsetWidth / max), 0, max);
      pos = reduce ? Math.round(t) : t;
      paint(pos);
    });
    function end() {
      if (!down) return;
      down = false; stage.classList.remove('is-dragging');
      if (dragged) settle(pos);
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // A drag should not open the lightbox
    stage.addEventListener('click', function (e) {
      if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
    }, true);

    sec.querySelector('.tt-prev').addEventListener('click', function () { settle(Math.round(pos) - 1); });
    sec.querySelector('.tt-next').addEventListener('click', function () { settle(Math.round(pos) + 1); });
    sec.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); settle(Math.round(pos) - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); settle(Math.round(pos) + 1); }
    });
    paint(pos);
  }

  /* Frame loop --------------------------------------------------------- */
  var ticking = false;
  function frame() {
    ticking = false;
    var y = window.scrollY;
    if (hero && y < hero.offsetHeight + 200) {
      layers.forEach(function (el) {
        el.style.transform = 'translate3d(0,' + (y * parseFloat(el.dataset.depth)).toFixed(1) + 'px,0)';
      });
    }
    drifters.forEach(function (img) {
      var r = img.parentNode.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      // -1 as the window enters at the bottom, +1 as it leaves at the top
      var p = clamp((vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2), -1, 1);
      var k = parseFloat(img.parentNode.dataset.drift) || 0.04;
      img.style.transform = 'translate3d(0,' + (p * r.height * k).toFixed(1) + 'px,0)';
    });
    floats.forEach(function (ul) {
      var r = ul.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      var p = clamp((vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2), -1, 1);
      ul.style.transform = 'translate3d(0,' + (-p * r.height * parseFloat(ul.dataset.float)).toFixed(1) + 'px,0)';
    });
    if (!reduce) zoomIns.forEach(function (z) {
      var r = z.parentNode.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      // 0 as the image enters at the bottom of the screen, 1 as it leaves at the top
      var t = clamp((vh - r.top) / (vh + r.height), 0, 1);
      var sc = 1.0 + 0.1 * t;
      z.style.transform = 'translate3d(0,' + ((0.5 - t) * r.height * 0.05).toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ')';
    });
    if (!reduce && vw > 639) duos.forEach(function (d) {
      var r = d.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      var t = clamp((vh - r.top) / (vh + r.height), 0, 1);
      var row = d.firstElementChild;
      row.style.transform = 'scale(' + (1 + 0.06 * t).toFixed(4) + ')';
      all('.duo-item', d).forEach(function (it) {
        it.style.transform = 'translate3d(0,' + ((t - 0.5) * r.height * parseFloat(it.dataset.depth)).toFixed(1) + 'px,0)';
      });
    });
    strips.forEach(render);
    reveals.forEach(renderReveal);
    pans.forEach(function (win) {
      var r = win.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      var img = win.querySelector('img');
      var travel = img.offsetHeight - r.height;
      if (travel <= 0) return;
      // the face holds while the window sits on screen; the pan to the
      // bottom of the photo happens as the window scrolls up and away
      var p = clamp((0.2 * vh - r.top) / r.height, 0, 1);
      img.style.transform = 'translate3d(0,' + (-p * travel).toFixed(1) + 'px,0)';
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  if (!reduce) {
    all('.strip').forEach(setupStrip);
    all('[data-reveal]').forEach(setupReveal);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      vh = window.innerHeight; vw = document.documentElement.clientWidth;
      strips.forEach(function (s) { s.measure(); });
      onScroll();
    });
    window.addEventListener('load', function () { strips.forEach(function (s) { s.measure(); }); onScroll(); });
    frame();
  }

  all('.walk').forEach(setupTurntable);

  /* Emails: measure how far each can glide on hover (and how long it takes) */
  function measureMail(win) {
    var img = win.querySelector('img');
    var travel = Math.max(0, img.offsetHeight - win.clientHeight);
    win.style.setProperty('--travel', travel + 'px');
    win.style.setProperty('--dur', Math.max(2, travel / 110).toFixed(1) + 's');
  }
  var mailWins = all('[data-mail]');
  mailWins.forEach(function (win) {
    var img = win.querySelector('img');
    if (img.complete) measureMail(win); else img.addEventListener('load', function () { measureMail(win); });
  });
  window.addEventListener('resize', function () { mailWins.forEach(measureMail); });

  /* Campaign bars: arrow buttons step through; mouse can drag the row ----- */
  all('.bars').forEach(function (sec) {
    var view = sec.querySelector('.bars-view');
    var step = function (dir) {
      var li = view.querySelector('li');
      var w = li ? li.getBoundingClientRect().width + 8 : 200;
      view.scrollBy({ left: dir * w * 2, behavior: reduce ? 'auto' : 'smooth' });
    };
    sec.querySelector('.bars-prev').addEventListener('click', function () { step(-1); });
    sec.querySelector('.bars-next').addEventListener('click', function () { step(1); });
    var x0 = 0, s0 = 0, down = false, dragged = false;
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; dragged = false; x0 = e.clientX; s0 = view.scrollLeft;
    });
    view.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - x0;
      if (!dragged && Math.abs(dx) > 6) { dragged = true; view.classList.add('is-dragging'); }
      if (dragged) view.scrollLeft = s0 - dx;
    });
    var end = function () { down = false; view.classList.remove('is-dragging'); };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointerleave', end);
    view.addEventListener('click', function (e) {
      if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
    }, true);
  });

  /* Video: start only when asked; show native controls from then on ------ */
  all('.vid-play').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = btn.parentNode.querySelector('video');
      v.controls = true;
      btn.hidden = true;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
      v.focus();
    });
  });

  /* Reveal: hide only what starts below the fold, show it on arrival -- */
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.remove('is-pre'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    all('.reveal').forEach(function (el) {
      if (el.getBoundingClientRect().top > vh) { el.classList.add('is-pre'); io.observe(el); }
    });
  }


  /* Page viewer: one stage, dots and arrows for pages, a tab for the language ---- */
  all('.viewer').forEach(function (sec) {
    var pages = all('.vp', sec), n = pages.length, on = 0, lang = 'en';
    var tabs = all('.v-tabs button', sec), tabBox = sec.querySelector('.v-tabs');
    var dots = all('.tt-dot', sec), cap = sec.querySelector('.v-cap');
    var stage = sec.querySelector('.v-stage');
    sec.classList.add('is-ready');
    sec.querySelector('.v-bar').hidden = false;
    function paintLang() {
      pages.forEach(function (vp) {
        var has = vp.dataset.zh === '1';
        all('.vp-lang', vp).forEach(function (el) {
          el.classList.toggle('is-on', el.dataset.lang === (has ? lang : 'en'));
        });
      });
      tabs.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false'); });
    }
    function go(i) {
      on = (i + n) % n;
      pages.forEach(function (vp, k) { vp.classList.toggle('is-on', k === on); });
      dots.forEach(function (d, k) { d.classList.toggle('is-on', k === on); });
      cap.textContent = pages[on].dataset.title;
      tabBox.hidden = pages[on].dataset.zh !== '1';
      alignCap();
    }
    // side viewers: the caption starts at the left edge of the page shown, not of the stage
    function alignCap() {
      var box = pages[on].querySelector('.vp-box');
      if (!sec.classList.contains('is-side') || !box || window.innerWidth < 900) { cap.style.marginLeft = ''; return; }
      cap.style.marginLeft = Math.max(0, Math.round(box.getBoundingClientRect().left - stage.getBoundingClientRect().left)) + 'px';
    }
    window.addEventListener('resize', alignCap);
    tabs.forEach(function (b) { b.addEventListener('click', function () { lang = b.dataset.lang; paintLang(); }); });
    sec.querySelector('.v-prev').addEventListener('click', function () { go(on - 1); });
    sec.querySelector('.v-next').addEventListener('click', function () { go(on + 1); });
    sec.addEventListener('keydown', function (e) {
      if (e.target.closest && e.target.closest('.v-tabs')) return;
      if (e.key === 'ArrowLeft') go(on - 1);
      if (e.key === 'ArrowRight') go(on + 1);
    });
    var x0 = null, y0 = 0, swiped = false;
    stage.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; swiped = false; });
    stage.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; go(on + (dx < 0 ? 1 : -1)); }
    });
    stage.addEventListener('click', function (e) { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);
    go(0); paintLang();
  });

  /* Gallery: one or two pieces at a time, soft auto-advance until someone touches it ---- */
  all('.gallery').forEach(function (sec) {
    var slides = all('.g-slide', sec), items = all('.g-item', sec);
    var dotBox = sec.querySelector('.tt-dots'), mq = window.matchMedia('(max-width: 720px)');
    var views = [], on = 0, timer = null, stopped = false, hovering = false, visible = false;
    var delay = parseInt(sec.dataset.auto, 10) || 6500;
    sec.classList.add('is-ready');
    sec.querySelector('.g-bar').hidden = false;
    function build() {
      views = mq.matches ? items : slides;
      slides.forEach(function (s) { s.classList.remove('is-on'); });
      items.forEach(function (s) { s.classList.remove('is-on'); });
      dotBox.innerHTML = views.map(function () { return '<span class="tt-dot"></span>'; }).join('');
      go(0);
    }
    function go(i) {
      on = (i + views.length) % views.length;
      views.forEach(function (v, k) { v.classList.toggle('is-on', k === on); });
      all('.tt-dot', dotBox).forEach(function (d, k) { d.classList.toggle('is-on', k === on); });
    }
    function tick() { if (!stopped && !hovering && visible && !document.hidden) go(on + 1); }
    function stop() { stopped = true; if (timer) { clearInterval(timer); timer = null; } }
    function user(fn) { return function () { stop(); fn(); }; }
    sec.querySelector('.g-prev').addEventListener('click', user(function () { go(on - 1); }));
    sec.querySelector('.g-next').addEventListener('click', user(function () { go(on + 1); }));
    sec.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { stop(); go(on - 1); }
      if (e.key === 'ArrowRight') { stop(); go(on + 1); }
    });
    var stage = sec.querySelector('.g-stage'), x0 = null, y0 = 0, swiped = false;
    stage.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; swiped = false; });
    stage.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; stop(); go(on + (dx < 0 ? 1 : -1)); }
    });
    stage.addEventListener('click', function (e) { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);
    dotBox.addEventListener('click', function (e) {
      var k = all('.tt-dot', dotBox).indexOf(e.target); if (k > -1) { stop(); go(k); }
    });
    sec.addEventListener('mouseenter', function () { hovering = true; });
    sec.addEventListener('mouseleave', function () { hovering = false; });
    sec.addEventListener('focusin', function () { hovering = true; });
    sec.addEventListener('focusout', function () { hovering = false; });
    if (mq.addEventListener) mq.addEventListener('change', build);
    build();
    if (!reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.4 }).observe(sec);
      timer = setInterval(tick, delay);
    }
  });

  /* Lightbox ---------------------------------------------------------- */
  var dlg = document.querySelector('.lightbox');
  var zooms = all('.zoom:not([data-clone])');
  if (!dlg || !dlg.showModal || !zooms.length) return;
  var big = dlg.querySelector('img');
  var idx = 0;
  var opener = null;

  function show(i) {
    idx = (i + zooms.length) % zooms.length;
    big.src = zooms[idx].dataset.full;
    big.alt = zooms[idx].querySelector('img').alt;
  }
  document.addEventListener('click', function (e) {
    var z = e.target.closest && e.target.closest('.zoom');
    if (!z) return;
    var i = zooms.indexOf(z);
    if (i < 0) {  // a looping copy: open its original
      var src = z.dataset.full;
      i = zooms.findIndex(function (o) { return o.dataset.full === src; });
    }
    opener = z; show(i); dlg.showModal();
  });
  dlg.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
  dlg.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
  dlg.querySelector('.lb-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
  dlg.addEventListener('close', function () { big.removeAttribute('src'); if (opener) opener.focus(); });
})();

/* Fill the wave: scroll lights the turtles one by one; the count follows. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var sec = document.querySelector('[data-wave]');
  if (!sec) return;
  var final = +sec.dataset.final, cells = [].slice.call(sec.querySelectorAll('.wv')), out = sec.querySelector('[data-count]');
  var last = -1, ticking = false;
  function frame() {
    ticking = false;
    var r = sec.getBoundingClientRect(), vh = window.innerHeight;
    // fills as the block rises through the screen; done by the time it sits mid-screen
    var p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.5)));
    var start = 30, steps = Math.round((final - start) / 10);
    var n = start + Math.min(steps, Math.floor(p * (steps + 1))) * 10;
    if (n === last) return;
    last = n; out.textContent = n;
    cells.forEach(function (c) {
      var on = +c.dataset.o < n;
      c.style.transitionDelay = on ? ((+c.dataset.o % 10) * 45) + 'ms' : '0ms';
      c.classList.toggle('on', on);
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();
})();

/* Standing banner turn */
(function(){document.querySelectorAll('.flip').forEach(function(f){var b=f.querySelector('.flip-btn'),c=f.querySelector('.flip-card'),ang=0,x0=null,base=0,moved=false,id=null;
function set(a,anim){c.style.transition=anim?'':'none';c.style.transform='rotateY('+a+'deg)'}
function snap(to){ang=to;set(to,true);b.setAttribute('aria-pressed',to===180?'true':'false')}
function toggle(){snap(ang===0?180:0)}
b.addEventListener('dragstart',function(e){e.preventDefault()});
b.addEventListener('pointerdown',function(e){x0=e.clientX;base=ang;moved=false;id=e.pointerId;try{b.setPointerCapture(id)}catch(_){}});
b.addEventListener('pointermove',function(e){if(x0===null)return;var dx=e.clientX-x0;if(Math.abs(dx)>4)moved=true;if(moved){var a=Math.max(0,Math.min(180,base+dx*.9));set(a,false)}});
function end(e){if(x0===null)return;var dx=e.clientX-x0;x0=null;if(moved){var cur=Math.max(0,Math.min(180,base+dx*.9));snap(cur>90?180:0)}else toggle();}
b.addEventListener('pointerup',end);b.addEventListener('pointercancel',function(){if(x0!==null){x0=null;snap(ang)}});
b.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();toggle()}});
f.querySelector('.flip-prev').addEventListener('click',toggle);f.querySelector('.flip-next').addEventListener('click',toggle);
});})();

/* Carousel in a phone: one slide inside the screen at a time */
(function(){document.querySelectorAll('[data-car]').forEach(function(f){
 var tracks=[].slice.call(f.querySelectorAll('.car-track')),tabs=[].slice.call(f.querySelectorAll('.car-tab')),dots=[].slice.call(f.querySelectorAll('.car-dot')),set=0,i=0,screen=f.querySelector('.screen');
 function n(){return tracks[set].children.length}
 function show(){tracks.forEach(function(t,k){t.hidden=k!==set});tracks[set].style.transform='translateX('+(-100*i)+'%)';dots.forEach(function(d,k){d.classList.toggle('on',k===i);d.style.display=k<n()?'':'none'});tabs.forEach(function(b,k){b.setAttribute('aria-pressed',k===set?'true':'false')})}
 function go(d){i=(i+d+n())%n();show()}
 f.querySelector('.car-prev').addEventListener('click',function(){go(-1)});
 f.querySelector('.car-next').addEventListener('click',function(){go(1)});
 tabs.forEach(function(b,k){b.addEventListener('click',function(){set=k;i=0;tracks[set].style.transition='none';show();void tracks[set].offsetWidth;tracks[set].style.transition=''})});
 var x0=null;screen.addEventListener('pointerdown',function(e){x0=e.clientX});
 window.addEventListener('pointerup',function(e){if(x0===null)return;var dx=e.clientX-x0;x0=null;if(Math.abs(dx)>40)go(dx<0?1:-1)});
 screen.addEventListener('click',function(e){if(!e.target.closest('.car-track'))return;});
 show();
});})();

/* Carousel stage: the full carousel is always shown; tabs only switch which carousel */
(function(){document.querySelectorAll('[data-cs]').forEach(function(f){
 var tracks=[].slice.call(f.querySelectorAll('.cs-track')),tabs=[].slice.call(f.querySelectorAll('.car-tab')),copies=[].slice.call(f.querySelectorAll('.cs-copy-item'));
 function show(set){tracks.forEach(function(t,k){t.hidden=k!==set});copies.forEach(function(c,k){c.hidden=k!==set});tabs.forEach(function(b,k){b.setAttribute('aria-pressed',k===set?'true':'false')})}
 tabs.forEach(function(b,k){b.addEventListener('click',function(){show(k)})});
 show(0);
});})();

/* Header: compact after the first scroll; Work opens the project panel */
(function(){
  var head=document.querySelector('.site-head'); if(!head) return;
  var root=document.documentElement;
  function sync(){ head.classList.toggle('is-compact', (window.scrollY||root.scrollTop)>40); }
  sync(); window.addEventListener('scroll',sync,{passive:true});
  var tog=head.querySelector('.work-toggle'), panel=document.getElementById('work-panel');
  if(!tog||!panel) return;
  function open(){ panel.hidden=false; tog.setAttribute('aria-expanded','true'); root.classList.add('work-open'); }
  function close(ret){ if(panel.hidden) return; panel.hidden=true; tog.setAttribute('aria-expanded','false'); root.classList.remove('work-open'); if(ret) tog.focus(); }
  tog.addEventListener('click',function(e){ e.preventDefault(); panel.hidden?open():close(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') close(true); });
  document.addEventListener('click',function(e){ if(!panel.hidden && !e.target.closest('.site-bar')) close(); });
  panel.addEventListener('click',function(e){ if(e.target.closest('a')) close(); });
  window.addEventListener('resize',function(){ close(); });
})();
