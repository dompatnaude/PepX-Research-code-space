/**
 * Card rail — browser driver.
 *
 * Contains no payment-host address of its own: the host origin arrives from
 * this store's own server at session time, so this file is safe to serve
 * publicly. The card is typed inside the host's frame and never touches a
 * field on this page.
 */
(function () {
  'use strict';

  var state = {
    origin: null, frame: null, ready: false, mounted: false,
    session: null, orderId: null, resolve: null, reject: null,
    prevStyle: null, greeting: null,
  };

  function el(id) { return document.getElementById(id); }
  function say(text, isError) {
    var m = el('cardMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'card-msg' + (isError ? ' is-error' : '');
  }
  function tellFrame(msg) {
    if (!state.frame || !state.frame.contentWindow || !state.origin) return;
    try { state.frame.contentWindow.postMessage(msg, state.origin); } catch (e) { /* frame gone */ }
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { status: r.status, body: j };
      });
    });
  }

  // ── 3DS: the challenge renders INSIDE the card frame. Give it a full-size
  // home by restyling the frame IN PLACE. Never re-parent it — moving an
  // iframe in the DOM reloads it and destroys the challenge mid-flight.
  function begin3ds() {
    var f = state.frame, ov = el('threeDsOverlay');
    if (!f) return;
    state.prevStyle = f.getAttribute('style') || '';
    if (ov) ov.hidden = false;
    f.style.position = 'fixed';
    f.style.left = '50%';
    f.style.top = '50%';
    f.style.transform = 'translate(-50%, -50%)';
    f.style.width = 'min(440px, 94vw)';
    f.style.height = 'min(640px, 88vh)';
    f.style.maxHeight = '88vh';
    f.style.zIndex = '2147483000';
    f.style.background = '#fff';
    f.style.borderRadius = '10px';
    f.style.boxShadow = '0 24px 70px rgba(0,0,0,.35)';
    f.style.display = 'block';
    say('Your bank needs to verify this payment — please complete the step shown.');
  }
  function end3ds() {
    var f = state.frame, ov = el('threeDsOverlay');
    if (ov) ov.hidden = true;
    if (f) f.setAttribute('style', state.prevStyle == null ? '' : state.prevStyle);
    state.prevStyle = null;
  }

  function onMessage(e) {
    if (!state.origin || e.origin !== state.origin) return;   // pin: only the payment origin is heard
    var m = e.data || {};
    if (m.type === 'maef-ready') {
      state.ready = true;
      if (state.greeting) { clearInterval(state.greeting); state.greeting = null; }
      var boot = el('cardFrameBoot');
      if (boot) boot.style.display = 'none';
      if (state.frame) state.frame.style.display = 'block';
      say('');
      return;
    }
    if (m.type === 'maef-size' && typeof m.h === 'number') {
      if (state.prevStyle != null) return;                    // mid-challenge: the clamp must not apply
      if (state.frame) state.frame.style.height = Math.min(420, Math.max(58, Math.ceil(m.h))) + 'px';
      return;
    }
    if (m.type === 'maef-3ds') {
      if (m.state === 'start') begin3ds();
      else if (m.state === 'end') end3ds();
      return;
    }
    if (m.type === 'maef-result') {
      end3ds();
      if (m.status === 'approved' || m.status === 'review') {
        say(m.status === 'review' ? 'Payment received — confirming it now…' : 'Payment approved — completing your order…');
        // Confirm server-to-server. The browser never asserts payment; only the
        // payment host's signed answer settles this order.
        api('/api/checkout/card/confirm', { order_id: state.orderId }).then(function (r) {
          if (r.body && r.body.paid) { if (state.resolve) state.resolve({ paid: true }); }
          else if (m.status === 'review') { if (state.resolve) state.resolve({ paid: false, pending: true }); }
          else { say('We could not confirm the payment. Please contact us before retrying.', true); if (state.reject) state.reject(new Error('confirm_failed')); }
        }).catch(function () {
          say('We could not confirm the payment. Please contact us before retrying.', true);
          if (state.reject) state.reject(new Error('confirm_unreachable'));
        });
        return;
      }
      if (m.status === 'declined') say('Your card was declined. Please try another card.', true);
      else say('We could not complete that payment. Please try again.', true);
      if (state.reject) state.reject(new Error(m.status || 'error'));
      return;
    }
    if (m.type === 'maef-error') {
      end3ds();
      say(m.reason === 'card-invalid'
        ? 'Please check your card details and try again.'
        : 'We could not start the payment. Please try again.', true);
      if (state.reject) state.reject(new Error(m.reason || 'error'));
    }
  }

  /** Mount the host's card frame so the buyer can type before placing the order. */
  function mount() {
    if (state.mounted) return Promise.resolve();
    var frame = el('cardFrame');
    if (!frame) return Promise.reject(new Error('no_frame'));
    return api('/api/checkout/card/prepare', {}).then(function (r) {
      if (r.status !== 200 || !r.body || !r.body.embed_pay) throw new Error('prepare_failed');
      state.origin = new URL(r.body.embed_pay).origin;
      state.frame = frame;
      state.mounted = true;
      window.addEventListener('message', onMessage);
      frame.addEventListener('load', function () {
        // The host frame carries no address of ours, so it stays silent until
        // spoken to. Greet it, and retry briefly: its listener may not be
        // attached at the instant `load` fires.
        var tries = 0;
        tellFrame({ type: 'maef-mount', hideButton: true });
        state.greeting = setInterval(function () {
          tellFrame({ type: 'maef-mount', hideButton: true });
          if (++tries > 24 || state.ready) { clearInterval(state.greeting); state.greeting = null; }
        }, 250);
      });
      frame.src = r.body.embed_pay + (r.body.frame_ticket ? ('?t=' + encodeURIComponent(r.body.frame_ticket)) : '');
      return true;
    });
  }

  /** Charge the card the buyer already typed, against a freshly placed order. */
  function charge(orderId) {
    state.orderId = orderId;
    return new Promise(function (resolve, reject) {
      state.resolve = resolve; state.reject = reject;
      if (!state.ready) { reject(new Error('fields_not_ready')); return; }
      api('/api/checkout/card/session', { order_id: orderId }).then(function (r) {
        if (r.status !== 200 || !r.body || !r.body.session_token) { reject(new Error('session_failed')); return; }
        state.session = r.body;
        say('Authorising your card…');
        tellFrame({ type: 'maef-init', amount: r.body.amount, sessionToken: r.body.session_token, billing: r.body.billing, hideButton: true });
        tellFrame({ type: 'maef-charge' });
      }).catch(function () { reject(new Error('session_unreachable')); });
    });
  }

  function isReady() { return state.ready; }
  function reset() { state.resolve = null; state.reject = null; }

  window.PXCard = { mount: mount, charge: charge, isReady: isReady, reset: reset, say: say };
})();
