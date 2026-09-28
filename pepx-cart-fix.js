/* PepX mobile cart fix. script.js rebuilds the whole cart list (innerHTML)
   on every +/-/remove tap - twice, once for the "updating" state and once
   when the server replies. On phones that throws away the button you just
   tapped, which can jump the drawer back to the top or nudge the page.
   On screens <= 720px this keeps the cart list's scroll position, the page
   scroll position and focus on the tapped button across each re-render.
   Desktop behaviour is untouched. Load right after script.js. */
(function () {
  'use strict';

  var mobile = window.matchMedia('(max-width: 720px)');
  var ATTRS = ['data-inc', 'data-dec', 'data-rm'];

  function esc(v) {
    return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');
  }

  function wrap() {
    var orig = window.renderCart;
    if (typeof orig !== 'function' || orig.__pepxMobileFix) return;

    var wrapped = function () {
      if (!mobile.matches) return orig.apply(this, arguments);

      var drawer = document.getElementById('drawer');
      var list = drawer && drawer.querySelector('.drawer-body');
      var listTop = list ? list.scrollTop : 0;
      var pageY = window.scrollY;

      var focusSel = null;
      var active = document.activeElement;
      if (drawer && active && drawer.contains(active) && active.getAttribute) {
        for (var i = 0; i < ATTRS.length && !focusSel; i++) {
          var v = active.getAttribute(ATTRS[i]);
          if (v !== null) focusSel = '[' + ATTRS[i] + '="' + esc(v) + '"]';
        }
      }

      var result = orig.apply(this, arguments);

      if (list && list.scrollTop !== listTop) list.scrollTop = listTop;
      if (window.scrollY !== pageY) window.scrollTo(0, pageY);
      if (focusSel && drawer) {
        var again = drawer.querySelector(focusSel);
        if (again) {
          try { again.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
        }
      }
      return result;
    };
    wrapped.__pepxMobileFix = true;
    window.renderCart = wrapped;
  }

  wrap();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrap);
})();
