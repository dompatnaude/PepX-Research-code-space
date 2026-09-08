'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { startStatic, stubAdminApi } = require('./helpers.js');

let ctx;

test.before(async function () {
  const s = await startStatic();
  const browser = await chromium.launch();
  ctx = { server: s.server, port: s.port, browser: browser };
});

test.after(async function () {
  if (ctx) { await ctx.browser.close(); ctx.server.close(); }
});

const rowSel = function (id) { return 'tr.admin-order-detail-row[data-detail-for="' + id + '"]'; };
const panelSel = function (id) { return '#admin-order-panel-' + id; };
const toggleSel = function (id) { return '#admin-order-toggle-' + id; };

async function openAdmin(opts) {
  opts = opts || {};
  const page = await ctx.browser.newPage({ viewport: opts.viewport || { width: 1440, height: 900 } });
  page.__errors = [];
  page.on('pageerror', function (e) { page.__errors.push(e.message); });
  page.on('dialog', function (d) { d.accept().catch(function () {}); });
  const calls = await stubAdminApi(page, opts);
  page.__calls = calls;
  await page.goto('http://127.0.0.1:' + ctx.port + '/admin.html');
  await page.waitForSelector('[data-tab="orders"]');
  if (opts.tab !== 'home') {
    await page.click('[data-tab="orders"]');
    await page.waitForSelector('#ordersBody [data-open]');
  }
  return page;
}

async function isOpen(page, id) {
  return page.evaluate(function (sel) {
    const el = document.querySelector(sel);
    return !!el && !el.hidden;
  }, rowSel(id));
}

test('A1. orders table renders a hidden full-width detail row under every order row', async function () {
  const page = await openAdmin();
  const shape = await page.evaluate(function () {
    const rows = document.querySelectorAll('#ordersBody tr');
    const detail = document.querySelector('tr.admin-order-detail-row[data-detail-for="35"]');
    const orderRow = detail.previousElementSibling;
    const headCells = document.querySelectorAll('#ordersBody tr:not(.admin-order-detail-row) td').length;
    return {
      detailRows: document.querySelectorAll('tr.admin-order-detail-row').length,
      hidden: detail.hidden,
      colspan: detail.querySelector('td').getAttribute('colspan'),
      orderRowCells: orderRow.querySelectorAll('td').length,
      hasPanel: !!detail.querySelector('.admin-order-inline-detail'),
      totalRows: rows.length,
      headCells: headCells
    };
  });
  assert.strictEqual(shape.detailRows, 3);
  assert.strictEqual(shape.hidden, true);
  assert.strictEqual(shape.colspan, '11');
  assert.strictEqual(shape.orderRowCells, 11, 'colspan matches the order row cell count');
  assert.strictEqual(shape.hasPanel, true);
  assert.strictEqual(shape.totalRows, 6, '3 order rows + 3 detail rows');
  await page.close();
});

test('A2. data-open expands the correct order inline, directly below its row', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' h2');
  assert.strictEqual(await isOpen(page, 36), true);
  assert.strictEqual(await isOpen(page, 35), false);
  assert.strictEqual(await isOpen(page, 37), false);
  const placement = await page.evaluate(function () {
    const detail = document.querySelector('tr.admin-order-detail-row[data-detail-for="36"]');
    const prev = detail.previousElementSibling;
    return {
      prevIsOrderRow: !prev.classList.contains('admin-order-detail-row'),
      prevHasToggle: !!prev.querySelector('#admin-order-toggle-36'),
      text: detail.textContent.slice(0, 400)
    };
  });
  assert.strictEqual(placement.prevIsOrderRow, true);
  assert.strictEqual(placement.prevHasToggle, true);
  assert.match(placement.text, /PX-100036/);
  assert.strictEqual(await page.getAttribute(toggleSel(36), 'aria-expanded'), 'true');
  await page.close();
});

test('A3. only one admin order is expanded at a time', async function () {
  const page = await openAdmin();
  for (const id of [35, 36, 37]) {
    await page.click(toggleSel(id));
    await page.waitForSelector(panelSel(id) + ' h2');
    const openCount = await page.evaluate(function () {
      return Array.prototype.filter.call(
        document.querySelectorAll('tr.admin-order-detail-row'),
        function (r) { return !r.hidden; }
      ).length;
    });
    assert.strictEqual(openCount, 1, 'one detail row open after clicking ' + id);
  }
  assert.strictEqual(await isOpen(page, 37), true);
  await page.close();
});

test('A4. clicking the open admin order collapses it', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' h2');
  assert.strictEqual(await page.textContent(toggleSel(35)), 'Close');
  await page.click(toggleSel(35));
  await page.waitForTimeout(150);
  assert.strictEqual(await isOpen(page, 35), false);
  assert.strictEqual(await page.textContent(toggleSel(35)), 'Open');
  assert.strictEqual(await page.getAttribute(toggleSel(35), 'aria-expanded'), 'false');
  await page.close();
});

test('A5. dashboard Open switches to the Orders tab and expands that order inline', async function () {
  const page = await openAdmin({ tab: 'home' });
  await page.waitForSelector('#dashboardRecentOrders [data-open-order="37"]');
  await page.click('#dashboardRecentOrders [data-open-order="37"]');
  await page.waitForSelector(panelSel(37) + ' h2');
  assert.strictEqual(await isOpen(page, 37), true);
  const ordersVisible = await page.evaluate(function () {
    const b = document.getElementById('ordersBody');
    return !!(b && b.offsetParent);
  });
  assert.strictEqual(ordersVisible, true, 'orders tab is active');
  assert.match(await page.textContent(panelSel(37)), /PX-100037/);
  await page.close();
});

test('A6. customer-scoped order link opens the order inline in the Orders tab', async function () {
  const page = await openAdmin();
  await page.click('[data-tab="customers"]');
  await page.waitForTimeout(200);
  await page.evaluate(function () {
    const host = document.getElementById('customerDetailBody');
    host.innerHTML = '<table><tbody><tr><td><a href="#" data-order="36">PX-100036</a></td></tr></tbody></table>';
  });
  await page.$eval('#customerDetailBody [data-order="36"]', function (el) { el.click(); });
  await page.waitForSelector(panelSel(36) + ' h2');
  assert.strictEqual(await isOpen(page, 36), true);
  const ordersVisible = await page.evaluate(function () {
    const b = document.getElementById('ordersBody');
    return !!(b && b.offsetParent);
  });
  assert.strictEqual(ordersVisible, true, 'switched to the orders tab');
  assert.strictEqual(await page.evaluate(function () { return window.location.hash; }), '');
  await page.close();
});

test('A7. status controls still work from inside the inline detail', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(35));
  await page.waitForSelector('#btnProcessing', { state: 'attached' });
  await page.$eval('#btnProcessing', function (el) { el.scrollIntoView({ block: 'center' }); el.click(); });
  await page.waitForTimeout(500);
  const statusCalls = page.__calls.mutations.filter(function (m) { return /\/orders\/35\/status/.test(m); });
  assert.strictEqual(statusCalls.length, 1, 'exactly one status call: ' + JSON.stringify(page.__calls.mutations));
  assert.match(statusCalls[0], /processing/);
  assert.strictEqual(await isOpen(page, 35), true, 'detail stays open after the action');
  await page.$eval('#btnShipped', function (el) { el.scrollIntoView({ block: 'center' }); el.click(); });
  await page.waitForTimeout(500);
  const shipped = page.__calls.mutations.filter(function (m) { return /\/orders\/35\/status/.test(m) && /shipped/.test(m); });
  assert.strictEqual(shipped.length, 1);
  await page.close();
});

test('A8. Zelle mark-paid control still works', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(36));
  await page.waitForSelector('#btnConfirmZelle', { state: 'attached' });
  await page.$eval('#btnConfirmZelle', function (el) { el.scrollIntoView({ block: 'center' }); el.click(); });
  await page.waitForTimeout(600);
  const zelle = page.__calls.mutations.filter(function (m) { return /confirm-zelle-payment/.test(m); });
  assert.strictEqual(zelle.length, 1, 'zelle confirm posted once');
  assert.match(zelle[0], /\/orders\/36\//);
  await page.close();
});

test('A9. shipping rate and purchase-label controls still work', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(36));
  await page.waitForSelector('#btnGetShippingRates', { state: 'attached', timeout: 10000 });
  await page.$eval('#btnGetShippingRates', function (el) { el.scrollIntoView({ block: 'center' }); el.click(); });
  for (let i = 0; i < 40 && !page.__calls.mutations.some(function (m) { return /shipping\/rates/.test(m); }); i++) {
    await page.waitForTimeout(200);
  }
  const rates = page.__calls.mutations.filter(function (m) { return /shipping\/rates/.test(m); });
  assert.strictEqual(rates.length, 1, 'rates requested once: ' + JSON.stringify(page.__calls.mutations));
  assert.match(rates[0], /POST \/api\/admin\/orders\/36\/shipping\/rates/);
  await page.waitForSelector('#btnPurchaseShippingLabel', { state: 'attached', timeout: 8000 });
  await page.waitForSelector(panelSel(36) + ' input[type="radio"]', { state: 'attached', timeout: 8000 });
  await page.$eval(panelSel(36) + ' input[type="radio"]', function (el) { el.click(); });
  await page.waitForTimeout(500);
  await page.$eval('#btnPurchaseShippingLabel', function (el) { el.scrollIntoView({ block: 'center' }); el.click(); });
  await page.waitForTimeout(700);
  const purchased = page.__calls.mutations.filter(function (m) { return /shipping\/purchase/.test(m); });
  assert.strictEqual(purchased.length, 1, 'label purchased once (stubbed)');
  let stillOpen = false;
  for (let i = 0; i < 25; i++) { stillOpen = await isOpen(page, 36); if (stillOpen) break; await page.waitForTimeout(200); }
  assert.strictEqual(stillOpen, true, 'detail stays expanded after purchasing a label');
  await page.close();
});

test('A10. void label control is present and still wired for a purchased shipment', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(35));
  await page.waitForSelector('#btnVoidShippingLabel', { state: 'attached', timeout: 8000 });
  await page.$eval('#btnVoidShippingLabel', function (el) { el.scrollIntoView({ block: 'center' }); el.click(); });
  await page.waitForTimeout(700);
  const voided = page.__calls.mutations.filter(function (m) { return /shipping\/void/.test(m); });
  assert.strictEqual(voided.length, 1, 'void posted once (stubbed)');
  await page.close();
});

test('A11. timeline, customer, tracking and payment details render inline', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' h2');
  const text = await page.textContent(panelSel(35));
  assert.match(text, /Order placed/, 'timeline rendered');
  assert.match(text, /Payment received/);
  assert.match(text, /dana\.okonkwo/, 'customer email rendered');
  assert.match(text, /9400111899223197428574903215558842197/, 'tracking number rendered');
  assert.match(text, /Carrier/, 'carrier rendered');
  assert.match(text, /Status:/);
  assert.match(text, /Payment:/);
  await page.close();
});

test('A12. promo/discount order renders its promo details inline', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(37));
  await page.waitForSelector(panelSel(37) + ' h2');
  const text = await page.textContent(panelSel(37));
  assert.match(text, /PX-100037/);
  assert.match(text, /Recombinant Human Fibroblast/, 'line items rendered');
  await page.close();
});

test('A13. expansion survives a renderTable() re-render', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' h2');
  await page.click('[data-tab="products"]');
  await page.waitForTimeout(250);
  await page.click('[data-tab="orders"]');
  await page.waitForSelector('#ordersBody [data-open]');
  await page.waitForTimeout(600);
  assert.strictEqual(await isOpen(page, 36), true, 'still expanded after re-render');
  assert.strictEqual(await page.getAttribute(toggleSel(36), 'aria-expanded'), 'true');
  assert.match(await page.textContent(panelSel(36)), /PX-100036/);
  await page.close();
});

test('A14. no duplicate listeners after re-render (one click issues one request)', async function () {
  const page = await openAdmin();
  await page.click('[data-tab="products"]');
  await page.waitForTimeout(200);
  await page.click('[data-tab="orders"]');
  await page.waitForSelector('#ordersBody [data-open]');
  await page.waitForTimeout(300);
  const before = page.__calls.detail[35] || 0;
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' h2');
  await page.waitForTimeout(400);
  assert.strictEqual((page.__calls.detail[35] || 0) - before, 1, 'exactly one detail fetch per click');
  await page.close();
});

test('A15. failed admin detail shows an inline error with a working retry', async function () {
  const page = await openAdmin({ failDetailFor: [37] });
  await page.click(toggleSel(37));
  await page.waitForSelector(panelSel(37) + ' [data-admin-order-retry="37"]', { timeout: 8000 });
  assert.match(await page.textContent(panelSel(37)), /Could not load this order/i);
  assert.strictEqual(await isOpen(page, 37), true);
  const rows = await page.evaluate(function () { return document.querySelectorAll('#ordersBody tr').length; });
  assert.strictEqual(rows, 6, 'the rest of the orders table is intact');
  await page.close();
});

test('A16. no uncaught page errors during admin accordion use', async function () {
  const page = await openAdmin();
  await page.click(toggleSel(35));
  await page.waitForSelector(panelSel(35) + ' h2');
  await page.click(toggleSel(36));
  await page.waitForSelector(panelSel(36) + ' h2');
  await page.click(toggleSel(36));
  await page.waitForTimeout(300);
  assert.deepStrictEqual(page.__errors, []);
  await page.close();
});
