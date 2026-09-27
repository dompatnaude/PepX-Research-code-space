/* PepX Best Sellers carousel - coverflow-style card carousel for the homepage
   Best Sellers box (adapted from the Card Carousel component).

   It replaces only how Best Sellers is DISPLAYED. The products come from the
   same list (PRODUCTS.slice(0, 6)) and the same card renderer
   (renderProductCards + attachProductCardInteractions) in script.js, so every
   card, price, link and "View Details" button is exactly what it was.
   script.js is not modified; this file takes over renderHeroBestSellers(). */
(function () {
  'use strict';

  var AUTOPLAY_MS = 3500;
  var SWIPE_PX = 40;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function canRender() {
    return typeof PRODUCTS !== 'undefined' && PRODUCTS &&
      typeof renderProductCards === 'function' &&
      typeof attachProductCardInteractions === 'function';
  }

  function renderHeroBestSellersCarousel() {
    var rail = document.getElementById('heroBestSellers');
    var prev = document.getElementById('heroBestPrev');
    var next = document.getElementById('heroBestNext');
    if (!rail || !prev || !next || !canRender()) return;

    // Hand over from whichever version drew Best Sellers before (old or ours).
    if (typeof heroBestSellersController !== 'undefined' && heroBestSellersController &&
        typeof heroBestSellersController.dispose === 'function') {
      heroBestSellersController.dispose();
    }

    var heroBest = rail.closest('.hero-best') || rail.parentElement;
    var slider = rail.closest('.hero-best-slider') || rail;
    rail.classList.remove('is-exit-left', 'is-exit-right', 'is-enter-left', 'is-enter-right');

    var featured = PRODUCTS.slice(0, 6);
    if (!featured.length) { rail.innerHTML = ''; return; }

    rail.innerHTML = renderProductCards(featured, { viewLabel: 'View Details' });
    attachProductCardInteractions(rail);

    var cards = Array.prototype.slice.call(rail.children).filter(function (el) {
      return el.classList.contains('product-card');
    });
    var n = cards.length;
    var active = 0;
    var timer = null;
    var paused = false;
    var destroyed = false;
    var pointerX = null;
    var suppressClick = false;

    heroBest.classList.add('pepx-cf');

    // Pagination dots
    var oldDots = heroBest.querySelector('.pepx-cf-dots');
    if (oldDots) oldDots.remove();
    var dots = document.createElement('div');
    dots.className = 'pepx-cf-dots';
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', 'Choose a best seller');
    for (var d = 0; d < n; d++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'pepx-cf-dot';
      dot.setAttribute('data-index', String(d));
      dot.setAttribute('aria-label', 'Show best seller ' + (d + 1) + ' of ' + n);
      dots.appendChild(dot);
    }
    slider.insertAdjacentElement('afterend', dots);
    if (n < 2) dots.hidden = true;

    function offsetOf(i) {
      var o = (i - active) % n;
      if (o < 0) o += n;
      if (o > Math.floor(n / 2)) o -= n;
      return o;
    }

    function update() {
      cards.forEach(function (card, i) {
        var o = offsetOf(i);
        var isActive = o === 0;
        card.style.setProperty('--pepx-o', String(Math.max(-2, Math.min(2, o))));
        card.setAttribute('data-pepx-pos', Math.abs(o) > 1 ? 'far' : String(o));
        card.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        card.tabIndex = isActive ? 0 : -1;
        var focusables = card.querySelectorAll('a, button');
        for (var k = 0; k < focusables.length; k++) focusables[k].tabIndex = isActive ? 0 : -1;
      });
      var dotEls = dots.children;
      for (var j = 0; j < dotEls.length; j++) {
        dotEls[j].setAttribute('aria-current', j === active ? 'true' : 'false');
      }
    }

    function goTo(i) { active = ((i % n) + n) % n; update(); }
    function step(delta) { goTo(active + delta); }

    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
    function start() {
      stop();
      if (destroyed || n < 2 || paused || document.hidden || reduceMotion.matches) return;
      timer = window.setInterval(function () { step(1); }, AUTOPLAY_MS);
    }

    function onPrev() { step(-1); start(); }
    function onNext() { step(1); start(); }
    function onDots(e) {
      var btn = e.target.closest('.pepx-cf-dot');
      if (!btn) return;
      goTo(parseInt(btn.getAttribute('data-index'), 10));
      start();
    }
    // Clicking a side card brings it to the centre instead of opening it.
    function onRailClickCapture(e) {
      if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      var card = e.target.closest('.product-card');
      if (card && card.getAttribute('data-pepx-pos') !== '0') {
        e.preventDefault();
        e.stopPropagation();
        goTo(cards.indexOf(card));
        start();
      }
    }
    function onPointerDown(e) { pointerX = e.clientX; }
    function onPointerUp(e) {
      if (pointerX === null) return;
      var dx = e.clientX - pointerX;
      pointerX = null;
      if (Math.abs(dx) > SWIPE_PX) {
        suppressClick = true;
        window.setTimeout(function () { suppressClick = false; }, 400);
        step(dx < 0 ? 1 : -1);
        start();
      }
    }
    function onKeyDown(e) {
      if (!rail.contains(e.target)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    }
    function onEnter() { paused = true; stop(); }
    function onLeave() { paused = false; start(); }
    function onFocusIn() { paused = true; stop(); }
    function onFocusOut(e) {
      if (heroBest.contains(e.relatedTarget)) return;
      paused = false; start();
    }
    function onVisibility() { if (document.hidden) stop(); else start(); }
    function onMotionPref() { start(); }

    prev.addEventListener('click', onPrev);
    next.addEventListener('click', onNext);
    dots.addEventListener('click', onDots);
    rail.addEventListener('click', onRailClickCapture, true);
    rail.addEventListener('pointerdown', onPointerDown);
    rail.addEventListener('pointerup', onPointerUp);
    heroBest.addEventListener('keydown', onKeyDown);
    heroBest.addEventListener('mouseenter', onEnter);
    heroBest.addEventListener('mouseleave', onLeave);
    heroBest.addEventListener('focusin', onFocusIn);
    heroBest.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibility);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionPref);

    heroBestSellersController = {
      dispose: function () {
        if (destroyed) return;
        destroyed = true;
        stop();
        prev.removeEventListener('click', onPrev);
        next.removeEventListener('click', onNext);
        dots.removeEventListener('click', onDots);
        rail.removeEventListener('click', onRailClickCapture, true);
        rail.removeEventListener('pointerdown', onPointerDown);
        rail.removeEventListener('pointerup', onPointerUp);
        heroBest.removeEventListener('keydown', onKeyDown);
        heroBest.removeEventListener('mouseenter', onEnter);
        heroBest.removeEventListener('mouseleave', onLeave);
        heroBest.removeEventListener('focusin', onFocusIn);
        heroBest.removeEventListener('focusout', onFocusOut);
        document.removeEventListener('visibilitychange', onVisibility);
        if (reduceMotion.removeEventListener) reduceMotion.removeEventListener('change', onMotionPref);
        dots.remove();
        heroBest.classList.remove('pepx-cf');
      }
    };

    update();
    start();
  }

  // script.js calls renderHeroBestSellers() whenever products load or refresh;
  // from now on that call draws the carousel.
  window.renderHeroBestSellers = renderHeroBestSellersCarousel;

  // If script.js already drew the old single-card version, replace it now.
  if (canRender() && document.getElementById('heroBestSellers')) {
    renderHeroBestSellersCarousel();
  }
})();
