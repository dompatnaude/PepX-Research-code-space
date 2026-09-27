/* PepX Aurora - injects the background layers into every [data-pepx-aurora]
   element (use data-pepx-aurora="page" on <body> for a full-page background), adds restrained pointer parallax, and pauses when off-screen.
   No framework, no re-renders: pointer input is rAF-throttled and written
   straight to two CSS custom properties. */
(function () {
  'use strict';

  var MARKUP =
    '<div class="pepx-aurora__drift">' +
      '<div class="pepx-aurora__ribbon pepx-aurora__ribbon--a"></div>' +
      '<div class="pepx-aurora__ribbon pepx-aurora__ribbon--b"></div>' +
    '</div>' +
    '<div class="pepx-aurora__grid"></div>' +
    '<div class="pepx-aurora__beams">' +
      '<span class="pepx-aurora__beam"></span>' +
      '<span class="pepx-aurora__beam"></span>' +
      '<span class="pepx-aurora__beam"></span>' +
    '</div>' +
    '<div class="pepx-aurora__spotlight"></div>' +
    '<div class="pepx-aurora__horizon"></div>' +
    '<div class="pepx-aurora__edge"></div>' +
    '<div class="pepx-aurora__grain"></div>' +
    '<div class="pepx-aurora__vignette"></div>';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  function mount(host) {
    if (host.querySelector(':scope > .pepx-aurora')) return;
    var layer = document.createElement('div');
    layer.className = 'pepx-aurora';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = MARKUP;
    host.insertBefore(layer, host.firstChild);
    var isPage = host.getAttribute('data-pepx-aurora') === 'page';

    // Pause animation work while the hero is off-screen.
    var visible = true;
    function syncPaused() {
      layer.classList.toggle('is-paused', !visible || document.hidden);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        syncPaused();
      }).observe(host);
    }
    document.addEventListener('visibilitychange', syncPaused);

    // Restrained parallax: desktop pointers only, never with reduced motion.
    var frame = 0, nx = 0, ny = 0;
    function apply() {
      frame = 0;
      layer.style.setProperty('--pepx-px', nx.toFixed(3));
      layer.style.setProperty('--pepx-py', ny.toFixed(3));
    }
    function onMove(e) {
      if (reduce.matches || !finePointer.matches || !visible) return;
      var r = isPage
        ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
        : host.getBoundingClientRect();
      nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      if (!frame) frame = requestAnimationFrame(apply);
    }
    function reset() { nx = 0; ny = 0; if (!frame) frame = requestAnimationFrame(apply); }
    window.addEventListener('pointermove', onMove, { passive: true });
    (isPage ? document.documentElement : host).addEventListener('pointerleave', reset, { passive: true });
    if (reduce.addEventListener) reduce.addEventListener('change', reset);
  }

  function init() {
    var hosts = document.querySelectorAll('[data-pepx-aurora]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
