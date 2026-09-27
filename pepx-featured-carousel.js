/* PepX Featured products carousel - turns the homepage "Featured Research
   Peptides" grid into a horizontal, scrollable product row with round
   prev/next arrows (adapted from the Product Carousel component).

   Only the LAYOUT changes. script.js still renders the same products into
   #productGrid with the same cards, prices and links; this file wraps the
   grid, adds the arrows and keeps them in sync when the grid re-renders. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var CHEVRON_LEFT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function init() {
    var grid = document.querySelector('[data-pepx-home] #productGrid');
    if (!grid || grid.parentElement.classList.contains('pepx-pc')) return;

    // Wrap the grid so the arrows can sit on either side of it.
    var wrap = document.createElement('div');
    wrap.className = 'pepx-pc';
    grid.parentNode.insertBefore(wrap, grid);
    wrap.appendChild(grid);
    grid.classList.add('pepx-pc-track');
    grid.setAttribute('tabindex', '0');
    grid.setAttribute('aria-label', 'Featured research peptides, scroll sideways for more');

    function makeArrow(dir) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pepx-pc-arrow pepx-pc-arrow--' + dir;
      b.setAttribute('aria-label', dir === 'left' ? 'Scroll products left' : 'Scroll products right');
      b.innerHTML = dir === 'left' ? CHEVRON_LEFT : CHEVRON_RIGHT;
      b.addEventListener('click', function () {
        grid.scrollBy({
          left: (dir === 'left' ? -1 : 1) * grid.clientWidth * 0.8,
          behavior: reduceMotion.matches ? 'auto' : 'smooth'
        });
      });
      wrap.appendChild(b);
      return b;
    }
    var left = makeArrow('left');
    var right = makeArrow('right');

    var frame = 0;
    function syncArrows() {
      frame = 0;
      var scrollable = grid.scrollWidth > grid.clientWidth + 1;
      var atStart = grid.scrollLeft <= 1;
      var atEnd = Math.abs(grid.scrollWidth - grid.scrollLeft - grid.clientWidth) <= 1;
      wrap.classList.toggle('is-scrollable', scrollable);
      left.disabled = !scrollable || atStart;
      right.disabled = !scrollable || atEnd;
    }
    function queueSync() { if (!frame) frame = window.requestAnimationFrame(syncArrows); }

    // Staggered fade-up for the cards, once the row scrolls into view.
    function tagCards() {
      var cards = grid.children;
      for (var i = 0; i < cards.length; i++) cards[i].style.setProperty('--pepx-i', String(Math.min(i, 8)));
    }
    tagCards();
    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { wrap.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.15 });
      io.observe(wrap);
      window.setTimeout(function () { wrap.classList.add('is-in'); }, 2500); // safety net
    } else {
      wrap.classList.add('is-in');
    }

    grid.addEventListener('scroll', queueSync, { passive: true });
    window.addEventListener('resize', queueSync);
    // script.js re-renders the grid (filters, product refresh): keep in sync.
    new MutationObserver(function () {
      tagCards();
      grid.scrollLeft = 0;
      queueSync();
      window.setTimeout(syncArrows, 300);
    }).observe(grid, { childList: true });
    if ('ResizeObserver' in window) new ResizeObserver(queueSync).observe(grid);
    grid.addEventListener('load', queueSync, true); // images finishing load
    syncArrows();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
