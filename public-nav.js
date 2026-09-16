'use strict';

// Mobile navigation for the public pages.
//
// Below 900px styles.css hides nav.menu unless it carries the `open` class, so
// without a script the menu cannot be opened at all. This file is the whole of
// that behaviour: no framework, no dependency, no session state, and nothing
// that needs to know who is looking at the page.
//
// It is loaded only where no other script already does this job. The homepage
// gets it from public-home.js and /coas.html from coas.js, both of which
// predate this file; the guard below makes a double load harmless regardless.
(function () {
  function init() {
    var toggle = document.getElementById('mobileMenuToggle');
    var nav = document.getElementById('site-menu');
    if (!toggle || !nav) return;
    if (toggle.getAttribute('data-nav-bound') === '1') return;
    toggle.setAttribute('data-nav-bound', '1');

    function setOpen(open) {
      if (open) nav.classList.add('open');
      else nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    setOpen(false);

    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('open'));
    });

    // Tapping anywhere outside closes it, which is how the homepage menu
    // already behaves.
    document.addEventListener('click', function (e) {
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });

    // Escape closes and returns focus to the control that opened it. No focus
    // trap: the panel is a short list of links in normal document order, and
    // tabbing past it simply continues into the page.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.keyCode !== 27) return;
      if (!nav.classList.contains('open')) return;
      setOpen(false);
      toggle.focus();
    });

    // Growing back to a desktop width drops the class. Without this the menu
    // could be left carrying `open` on a layout that does not style it as a
    // panel, and the next shrink back to mobile would show it already open.
    if (window.matchMedia) {
      var wide = window.matchMedia('(min-width: 901px)');
      var onChange = function (e) { if (e.matches) setOpen(false); };
      if (wide.addEventListener) wide.addEventListener('change', onChange);
      else if (wide.addListener) wide.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
