'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { startStatic, stubAccountApi } = require('./helpers.js');

let ctx;

test.before(async function () {
  const s = await startStatic();
  const browser = await chromium.launch();
  ctx = { server: s.server, port: s.port, browser: browser };
});

test.after(async function () {
  if (ctx) { await ctx.browser.close(); ctx.server.close(); }
});

const panelSel = function (id) { return '#order-detail-panel-orders-' + id; };
const toggleSel = function (id) { return '#order-detail-toggle-orders-' + id; };

async function open(opts, query) {
  opts = opts || {};
  const page = await ctx.browser.newPage({ viewport: opts.viewport || { width: 1280, height: 900 } });
  page.__errors = [];
  page.on('pageerror', function (e) { page.__errors.push(e.message); });
  const calls = await stubAccountApi(page, opts);
  page.__calls = calls;
  await page.goto('http://127.0.0.1:' + ctx.port + '/account.html' + (query || '?tab=orders'));
  await page.waitForSelector('#ordersList .account-order-card', { state: 'attached' });
  const tab = opts.tab || 'orders';
  const listSel = tab === 'overview' ? '#overviewRecentOrders' : '#ordersList';
  const alreadyVisible = await page.evaluate(function (sel) {
    const el = document.querySelector(sel);
    return !!(el && el.offsetParent);
  }, listSel);
  if (!alreadyVisible && tab === 'orders') await page.click('[data-switch-tab="orders"]');
  await page.waitForSelector(listSel + ' .account-order-card', { state: 'visible' });
  return page;
}

async function expanded(page, id) {
  return page.evaluate(function (sel) {
    const el = document.querySelector(sel);
    return !!el && !el.hidden;
  }, panelSel(id));
}

test('1. all orders start collapsed on bare orders URL', async function () {
  const page = await open();
  for (const id of [35, 36, 37]) {
    assert.strictEqual(await expanded(page, id), false, 'order ' + id + ' should start collapsed');
    assert.strictEqual(await page.getAttribute(toggleSel(id), 'aria-expanded'), 'false');
  }
  assert.strictEqual(new URL(page.url()).searchParams.get('order_id'), null);
  await page.close();
});

test('2. clicking View Order expands that exact order inline', async function () {
  const page = await open();
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-grid');
  assert.strictEqual(await expanded(page, 36), true);
  assert.strictEqual(await expanded(page, 35), false);
  assert.strictEqual(await expanded(page, 37), false);
  const text = await page.textContent(panelSel(36));
  assert.match(text, /PX-100036/);
  await page.close();
});

test('3. detail renders inside the selected card, directly below its summary', async function () {
  const page = await open();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  const shape = await page.evaluate(function () {
    const p = document.querySelector('#order-detail-panel-orders-35');
    const card = p.closest('.account-order-card');
    return {
      cardId: card.getAttribute('data-order-card'),
      isLastChild: card.lastElementChild === p,
      prevClass: p.previousElementSibling.className
    };
  });
  assert.strictEqual(shape.cardId, '35');
  assert.strictEqual(shape.isLastChild, true);
  assert.strictEqual(shape.prevClass, 'account-order-actions');
  await page.close();
});

test('4. no separate bottom-of-page detail panel exists', async function () {
  const page = await open();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  const legacy = await page.evaluate(function () {
    return {
      card: !!document.getElementById('orderDetailCard'),
      body: !!document.getElementById('orderDetailBody'),
      back: !!document.getElementById('orderDetailBackBtn')
    };
  });
  assert.deepStrictEqual(legacy, { card: false, body: false, back: false });
  await page.close();
});

test('5. opening another order closes the previous one', async function () {
  const page = await open();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.click(toggleSel(37));
  await page.waitForSelector(panelSel(37) + ' .account-order-detail-grid');
  await page.waitForTimeout(300);
  assert.strictEqual(await expanded(page, 35), false, 'first order should have closed');
  assert.strictEqual(await expanded(page, 37), true);
  assert.strictEqual(await page.getAttribute(toggleSel(35), 'aria-expanded'), 'false');
  assert.strictEqual(await page.getAttribute(toggleSel(37), 'aria-expanded'), 'true');
  await page.close();
});

test('6. clicking the open order again collapses it', async function () {
  const page = await open();
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-grid');
  assert.strictEqual(await page.textContent(toggleSel(36)), 'Hide Order');
  await page.click(toggleSel(36));
  await page.waitForTimeout(300);
  assert.strictEqual(await expanded(page, 36), false);
  assert.strictEqual(await page.textContent(toggleSel(36)), 'View Order');
  assert.strictEqual(new URL(page.url()).searchParams.get('order_id'), null);
  await page.close();
});

test('7. only one order can be expanded at a time', async function () {
  const page = await open();
  for (const id of [35, 36, 37]) {
    await page.click(toggleSel(id));
    await page.waitForSelector(panelSel(id) + ' .account-order-detail-grid');
    await page.waitForTimeout(250);
    const openCount = await page.evaluate(function () {
      return Array.prototype.filter.call(
        document.querySelectorAll('#ordersList .account-order-inline-detail'),
        function (el) { return !el.hidden; }
      ).length;
    });
    assert.strictEqual(openCount, 1, 'exactly one panel open after clicking ' + id);
  }
  await page.close();
});

test('8. direct URL with order_id expands that order inline', async function () {
  const page = await open({}, '?tab=orders&order_id=37');
  await page.waitForSelector(panelSel(37) + ' .account-order-detail-grid');
  assert.strictEqual(await expanded(page, 37), true);
  assert.strictEqual(await expanded(page, 35), false);
  assert.strictEqual(await expanded(page, 36), false);
  assert.strictEqual(await page.evaluate(function () { return !!document.getElementById('orderDetailCard'); }), false);
  await page.close();
});

test('9. URL keeps order_id in sync when opening and closing', async function () {
  const page = await open();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  assert.strictEqual(new URL(page.url()).searchParams.get('order_id'), '35');
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-grid');
  assert.strictEqual(new URL(page.url()).searchParams.get('order_id'), '36');
  await page.click(toggleSel(36));
  await page.waitForTimeout(250);
  assert.strictEqual(new URL(page.url()).searchParams.get('order_id'), null);
  assert.strictEqual(new URL(page.url()).searchParams.get('tab'), 'orders');
  await page.close();
});

test('10. expanding does not scroll or jump the page', async function () {
  const page = await open({ viewport: { width: 390, height: 500 } });
  await page.evaluate(function () { window.scrollTo(0, 120); });
  const before = await page.evaluate(function () { return window.scrollY; });
  await page.$eval(toggleSel(37), function (el) { el.click(); });
  await page.waitForSelector(panelSel(37) + ' .account-order-detail-grid');
  await page.waitForTimeout(400);
  const after = await page.evaluate(function () { return window.scrollY; });
  assert.ok(Math.abs(after - before) <= 2, 'scroll moved from ' + before + ' to ' + after);
  assert.strictEqual(await page.evaluate(function () { return window.location.hash; }), '');
  await page.close();
});

test('11. inline loading state shows while detail is in flight', async function () {
  const page = await open({ slowDetail: 700 });
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-status');
  const loading = await page.textContent(panelSel(35));
  assert.match(loading, /Loading order details/);
  assert.strictEqual(await expanded(page, 35), true);
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.close();
});

test('12. failed detail fetch shows a contained inline error only', async function () {
  const page = await open({ failDetailFor: [36] });
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-error');
  const errText = await page.textContent(panelSel(36));
  assert.match(errText, /could not load this order/i);
  const intact = await page.evaluate(function () {
    return {
      cards: document.querySelectorAll('#ordersList .account-order-card').length,
      otherPanelsOk: !!document.querySelector('#order-detail-panel-orders-35'),
      pageBanner: (document.querySelector('.page-message, #pageMessage') || {}).textContent || ''
    };
  });
  assert.strictEqual(intact.cards, 3, 'rest of the orders tab still renders');
  assert.strictEqual(intact.otherPanelsOk, true);
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.close();
});

test('13. Try again re-fetches and renders the detail', async function () {
  const page = await open({ failDetailFor: [36], failTimes: 1 });
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' [data-order-retry="36"]');
  await page.click(panelSel(36) + ' [data-order-retry="36"]');
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-grid');
  assert.strictEqual(await expanded(page, 36), true);
  assert.match(await page.textContent(panelSel(36)), /PX-100036/);
  assert.strictEqual(page.__calls.detail[36], 2, 'retry issues exactly one more request');
  await page.close();
});

test('14. detail is cached and not refetched on reopen, and the list is not refetched', async function () {
  const page = await open();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.click(toggleSel(35));
  await page.waitForTimeout(250);
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.waitForTimeout(200);
  assert.strictEqual(page.__calls.detail[35], 1, 'detail fetched once and cached');
  assert.strictEqual(page.__calls.orders, 1, 'order list fetched once');
  await page.close();
});

test('15. promo/discount order renders discount, promo code and totals', async function () {
  const page = await open();
  await page.click(toggleSel(37));
  await page.waitForSelector(panelSel(37) + ' .account-order-totals');
  const text = await page.textContent(panelSel(37) + ' .account-order-totals');
  assert.match(text, /Discount/);
  assert.match(text, /RESEARCH-WELCOME-2026/);
  assert.match(text, /\$1,020\.50|\$1020\.50/);
  await page.close();
});

test('16. aria wiring is correct and collapsed content is not tabbable', async function () {
  const page = await open();
  const wiring = await page.evaluate(function () {
    const btn = document.getElementById('order-detail-toggle-orders-35');
    const p = document.getElementById('order-detail-panel-orders-35');
    return {
      controls: btn.getAttribute('aria-controls'),
      panelId: p.id,
      labelledBy: p.getAttribute('aria-labelledby'),
      btnId: btn.id,
      role: p.getAttribute('role'),
      tag: btn.tagName,
      type: btn.getAttribute('type')
    };
  });
  assert.strictEqual(wiring.controls, wiring.panelId);
  assert.strictEqual(wiring.labelledBy, wiring.btnId);
  assert.strictEqual(wiring.role, 'region');
  assert.strictEqual(wiring.tag, 'BUTTON');
  assert.strictEqual(wiring.type, 'button');
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.click(toggleSel(35));
  await page.waitForTimeout(300);
  const focusable = await page.evaluate(function () {
    const p = document.getElementById('order-detail-panel-orders-35');
    return Array.prototype.filter.call(p.querySelectorAll('a[href], button, input, select, textarea'), function (el) {
      return el.offsetParent !== null;
    }).length;
  });
  assert.strictEqual(focusable, 0, 'collapsed panel exposes no tabbable controls');
  await page.close();
});

test('17. keyboard activation toggles the accordion', async function () {
  const page = await open();
  await page.focus(toggleSel(36));
  await page.keyboard.press('Enter');
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-grid');
  assert.strictEqual(await expanded(page, 36), true);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  assert.strictEqual(await expanded(page, 36), false);
  await page.close();
});

test('18. overview and orders lists never produce duplicate DOM ids', async function () {
  const page = await open({ tab: 'overview' }, '?tab=overview');
  await page.waitForSelector('#overviewRecentOrders .account-order-card');
  const dupes = await page.evaluate(function () {
    const ids = Array.prototype.map.call(document.querySelectorAll('[id]'), function (el) { return el.id; });
    const seen = {}; const dup = [];
    ids.forEach(function (id) { if (seen[id]) { dup.push(id); } seen[id] = true; });
    return dup;
  });
  assert.deepStrictEqual(dupes, [], 'duplicate ids: ' + dupes.join(', '));
  const scopes = await page.evaluate(function () {
    return {
      overview: !!document.getElementById('order-detail-panel-overview-35'),
      orders: !!document.getElementById('order-detail-panel-orders-35')
    };
  });
  assert.deepStrictEqual(scopes, { overview: true, orders: true });
  await page.close();
});

test('19. no uncaught page errors during accordion use', async function () {
  const page = await open();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' .account-order-detail-grid');
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' .account-order-detail-grid');
  await page.click(toggleSel(36));
  await page.waitForTimeout(300);
  assert.deepStrictEqual(page.__errors, []);
  await page.close();
});
