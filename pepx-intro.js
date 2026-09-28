/* PepX welcome screen - "encrypted text" intro (adapted from the Encrypted
   Text component). On a visitor's first page of a browser session, a
   full-screen overlay decodes "Welcome to PepX Research." and then
   "PUSH. EXCEL. PREVAIL." from scrambled characters, then fades into the
   site. Click, tap or any key skips it. Load in <head> (no defer) so the
   page is hidden before it first paints - no flash of the site underneath. */
(function () {
  'use strict';

  var KEY = 'pepxIntroSeen';
  var LINES = ['Welcome to PepX Research.', 'PUSH. EXCEL. PREVAIL.'];
  var CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?';
  var REVEAL_MS = 50;   // per character, as in the component
  var FLIP_MS = 50;     // scramble jitter, as in the component
  var GAP_MS = 350;     // pause between the two lines
  var HOLD_MS = 800;    // hold once fully decoded
  var FADE_MS = 700;

  try {
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, '1');
  } catch (e) { /* storage blocked: still show it */ }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  root.classList.add('pepx-intro-on');

  var css =
    '.pepx-intro-on body > :not(#pepxIntro){visibility:hidden}' +
    '#pepxIntro{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
    'padding:24px;background-color:#fff;cursor:pointer;' +
    'background-image:radial-gradient(circle min(800px,60vw) at 100% 120px,rgba(0,150,220,.2),rgba(0,150,220,0)),' +
    'linear-gradient(to right,#f0f0f0 1px,transparent 1px),linear-gradient(to bottom,#f0f0f0 1px,transparent 1px);' +
    'background-size:auto,6rem 4rem,6rem 4rem;transition:opacity ' + FADE_MS + 'ms ease}' +
    '#pepxIntro.is-out{opacity:0;pointer-events:none}' +
    '#pepxIntro .pi-wrap{text-align:center;font-family:inherit}' +
    '#pepxIntro .pi-line{display:block;white-space:pre;font-variant-ligatures:none}' +
    '#pepxIntro .pi-1{font-size:clamp(22px,4.2vw,40px);font-weight:600;color:#0f172a;letter-spacing:-.01em}' +
    '#pepxIntro .pi-2{margin-top:14px;font-size:clamp(20px,6.6vw,72px);font-weight:800;letter-spacing:-.02em;' +
    'color:#003070;min-height:1.1em}' +
    '#pepxIntro .pi-enc{color:#94a3b8}' +
    '#pepxIntro .pi-2 .pi-rev{background:linear-gradient(100deg,#0f172a 0%,#003070 40%,#0070b0 70%,#0891c9 100%);' +
    '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;' +
    'background-size:var(--pi-w,100%) 100%;background-position:var(--pi-x,0) 0}' +
    '#pepxIntro .pi-skip{position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:12px;' +
    'letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}' +
    '@media (max-width:600px){#pepxIntro{background-size:auto,4rem 3rem,4rem 3rem}}';
  var style = document.createElement('style');
  style.id = 'pepxIntroStyle';
  style.textContent = css;
  (document.head || root).appendChild(style);

  var safety = null;

  function randChar() { return CHARSET.charAt(Math.floor(Math.random() * CHARSET.length)); }

  function buildLine(el, text) {
    el.setAttribute('aria-hidden', 'true');
    var spans = [];
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'pi-enc';
      s.textContent = text[i] === ' ' ? ' ' : randChar();
      el.appendChild(s);
      spans.push(s);
    }
    return spans;
  }

  // Decode one line; calls done() when every character is revealed.
  function decode(text, spans, done) {
    if (reduce) {
      for (var j = 0; j < spans.length; j++) { spans[j].textContent = text[j]; spans[j].className = 'pi-rev'; }
      done();
      return;
    }
    var start = performance.now(), lastFlip = start;
    function frame(now) {
      if (finished) return;
      var count = Math.min(text.length, Math.floor((now - start) / REVEAL_MS));
      var flip = now - lastFlip >= FLIP_MS;
      for (var i = 0; i < spans.length; i++) {
        if (i < count) {
          if (spans[i].className !== 'pi-rev') { spans[i].textContent = text[i]; spans[i].className = 'pi-rev'; }
        } else if (flip && text[i] !== ' ') {
          spans[i].textContent = randChar();
        }
      }
      if (flip) lastFlip = now;
      if (count >= text.length) { done(); return; }
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  var overlay, finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    if (safety) window.clearTimeout(safety);
    root.classList.remove('pepx-intro-on');
    document.removeEventListener('keydown', finish);
    if (!overlay) { cleanup(); return; }
    overlay.classList.add('is-out');
    window.setTimeout(cleanup, FADE_MS + 50);
  }
  function cleanup() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    var st = document.getElementById('pepxIntroStyle');
    if (st && st.parentNode) st.parentNode.removeChild(st);
  }

  // Opened in a background tab: wait until the visitor actually sees it.
  function start() {
    if (!document.hidden) { begin(); return; }
    document.addEventListener('visibilitychange', function onVis() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onVis);
      begin();
    });
  }

  function begin() {
    if (finished) return;
    // Safety net: never leave the site hidden, whatever happens.
    safety = window.setTimeout(finish, 9000);
    overlay = document.createElement('div');
    overlay.id = 'pepxIntro';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', LINES.join(' '));
    var wrap = document.createElement('div');
    wrap.className = 'pi-wrap';
    var l1 = document.createElement('span');
    l1.className = 'pi-line pi-1';
    var l2 = document.createElement('span');
    l2.className = 'pi-line pi-2';
    wrap.appendChild(l1);
    wrap.appendChild(l2);
    var skip = document.createElement('div');
    skip.className = 'pi-skip';
    skip.textContent = 'Tap to skip';
    overlay.appendChild(wrap);
    overlay.appendChild(skip);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', finish);
    document.addEventListener('keydown', finish);

    var s1 = buildLine(l1, LINES[0]);
    decode(LINES[0], s1, function () {
      window.setTimeout(function () {
        if (finished) return;
        var s2 = buildLine(l2, LINES[1]);
        // One continuous gradient across the whole second line.
        var first = s2[0], last = s2[s2.length - 1];
        var x0 = first.offsetLeft;
        var w = Math.max(1, last.offsetLeft + last.offsetWidth - x0);
        for (var k = 0; k < s2.length; k++) {
          s2[k].style.setProperty('--pi-w', w + 'px');
          s2[k].style.setProperty('--pi-x', (x0 - s2[k].offsetLeft) + 'px');
        }
        decode(LINES[1], s2, function () {
          window.setTimeout(finish, reduce ? 1200 : HOLD_MS);
        });
      }, reduce ? 0 : GAP_MS);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
