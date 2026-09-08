'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startStatic, stubAccountApi, stubAdminApi } = require('./helpers.js');

const SHOTS = path.join(__dirname, '__screenshots__');
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];
let ctx;

test.before(async function () {
  fs.mkdirSync(SHOTS, { recursive: true });
  const s = await startStatic();
  const browser = await chromium.launch();
  ctx = { server: s.server, port: s.port, browser: browser };
});

test.after(async function () {
  if (ctx) { await ctx.browser.close(); ctx.server.close(); }
});

// Elements allowed to scroll horizontally inside their own container.
const SCROLLABLE = ['account-order-table-wrap', 'admin-order-inline-detail', 'table-wrap', 'savings-table-wrap'];

async function auditOverflow(page, label) {
  return page.evaluate(function (args) {
    const allow = args.allow;
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    const all = document.querySelectorAll('body *');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!el.offsetParent && el.tagName !== 'BODY') continue;
      let skip = false;
      let p = el;
      while (p && p !== document.body) {
        const cls = typeof p.className === 'string' ? p.className : '';
        if (allow.some(function (a) { return cls.indexOf(a) !== -1; })) { skip = true; break; }
        p = p.parentElement;
      }
      if (skip) continue;
      // Off-canvas / fixed-position site chrome (e.g. the closed mini-cart drawer)
      // is parked outside the viewport by design and never widens the document.
      let fixed = false;
      let q = el;
      while (q && q !== document.body) {
        if (getComputedStyle(q).position === 'fixed') { fixed = true; break; }
        q = q.parentElement;
      }
      if (fixed) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({
          tag: el.tagName,
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          id: el.id || '',
          right: Math.round(r.right),
          left: Math.round(r.left)
        });
        if (offenders.length >= 6) break;
      }
    }
    return {
      label: args.label,
      viewport: vw,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders
    };
  }, { allow: SCROLLABLE, label: label });
}

function assertNoOverflow(res) {
  assert.ok(
    res.docScrollWidth <= res.viewport + 1,
    res[ 'label' ] + ': document scrollWidth ' + res.docScrollWidth + ' > viewport ' + res.viewport
  );
  assert.ok(
    res.bodyScrollWidth <= res.viewport + 1,
    res.label + ': body scrollWidth ' + res.bodyScrollWidth + ' > viewport ' + res.viewport
  );
  assert.deepStrictEqual(
    res.offenders, [],
    res.label + ': elements past the right edge -> ' + JSON.stringify(res.offenders)
  );
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(SHOTS, name + '.jpg'),
    fullPage: true,
    type: 'jpeg',
    quality: 72
  });
}

async function openCustomer(width, dark) {
  const page = await ctx.browser.newPage({ viewport: { width: width, height: 900 } });
  await stubAccountApi(page, {});
  await page.goto('http://127.0.0.1:' + ctx.port + '/account.html?tab=orders');
  await page.waitForSelector('#ordersList .account-order-card', { state: 'attached' });
  const visible = await page.evaluate(function () {
    const el = document.getElementById('ordersList');
    return !!(el && el.offsetParent);
  });
  if (!visible) await page.click('[data-switch-tab="orders"]');
  await page.waitForSelector('#ordersList .account-order-card', { state: 'visible' });
  if (dark) {
    await page.evaluate(function () { document.body.classList.add('dark-mode'); });
    await page.waitForTimeout(120);
  }
  return page;
}

for (const width of WIDTHS) {
  test('customer orders: no horizontal overflow at ' + width + 'px (collapsed)', async function () {
    const page = await openCustomer(width);
    const res = await auditOverflow(page, 'customer ' + width + ' collapsed');
    await shot(page, 'customer-' + width + '-collapsed');
    assertNoOverflow(res);
    await page.close();
  });

  test('customer orders: no horizontal overflow at ' + width + 'px (expanded, long content)', async function () {
    const page = await openCustomer(width);
    await page.click('#order-detail-toggle-orders-35');
    await page.waitForSelector('#order-detail-panel-orders-35 .account-order-detail-grid');
    await page.waitForTimeout(400);
    const res = await auditOverflow(page, 'customer ' + width + ' expanded');
    await shot(page, 'customer-' + width + '-expanded');
    assertNoOverflow(res);
    const fits = await page.evaluate(function () {
      const p = document.getElementById('order-detail-panel-orders-35');
      const card = p.closest('.account-order-card');
      const pr = p.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const btn = document.getElementById('order-detail-toggle-orders-35').getBoundingClientRect();
      return {
        panelWithinCard: pr.left >= cr.left - 1 && pr.right <= cr.right + 1,
        buttonWithinCard: btn.left >= cr.left - 1 && btn.right <= cr.right + 1,
        buttonTall: Math.round(btn.height),
        panelHeight: Math.round(pr.height)
      };
    });
    assert.strictEqual(fits.panelWithinCard, true, 'expanded panel stays inside its card');
    assert.strictEqual(fits.buttonWithinCard, true, 'toggle button stays inside its card');
    assert.ok(fits.buttonTall >= 28, 'toggle stays tappable (' + fits.buttonTall + 'px)');
    assert.ok(fits.panelHeight > 100, 'expanded panel actually has content');
    await page.close();
  });
}

test('customer orders: dark mode has no overflow at 390 and 1440', async function () {
  for (const width of [390, 1440]) {
    const page = await openCustomer(width, true);
    await page.click('#order-detail-toggle-orders-35');
    await page.waitForSelector('#order-detail-panel-orders-35 .account-order-detail-grid');
    await page.waitForTimeout(400);
    const res = await auditOverflow(page, 'customer dark ' + width);
    await shot(page, 'customer-' + width + '-expanded-dark');
    assertNoOverflow(res);
    await page.close();
  }
});

async function openAdmin(width) {
  const page = await ctx.browser.newPage({ viewport: { width: width, height: 900 } });
  await stubAdminApi(page, {});
  await page.goto('http://127.0.0.1:' + ctx.port + '/admin.html');
  await page.waitForSelector('[data-tab="orders"]');
  await page.click('[data-tab="orders"]');
  await page.waitForSelector('#ordersBody [data-open]');
  return page;
}

for (const width of [390, 768, 1024, 1440]) {
  test('admin orders: detail row alignment and overflow at ' + width + 'px', async function () {
    const page = await openAdmin(width);
    await shot(page, 'admin-' + width + '-collapsed');
    await page.click('#admin-order-toggle-35');
    await page.waitForSelector('#admin-order-panel-35 h2');
    await page.waitForTimeout(400);
    await shot(page, 'admin-' + width + '-expanded');
    const geo = await page.evaluate(function () {
      const detail = document.querySelector('tr.admin-order-detail-row[data-detail-for="35"]');
      const orderRow = detail.previousElementSibling;
      const dr = detail.getBoundingClientRect();
      const or = orderRow.getBoundingClientRect();
      const table = detail.closest('table').getBoundingClientRect();
      return {
        sameLeft: Math.abs(dr.left - or.left) <= 1,
        sameWidth: Math.abs(dr.width - or.width) <= 1,
        fullWidth: Math.abs(dr.width - table.width) <= 2,
        below: dr.top >= or.bottom - 1,
        colspan: detail.querySelector('td').getAttribute('colspan'),
        cells: orderRow.querySelectorAll('td').length
      };
    });
    assert.strictEqual(geo.sameLeft, true, 'detail row aligns with its order row');
    assert.strictEqual(geo.sameWidth, true, 'detail row matches the order row width');
    assert.strictEqual(geo.fullWidth, true, 'detail row spans the whole table');
    assert.strictEqual(geo.below, true, 'detail row sits directly below its order row');
    assert.strictEqual(Number(geo.colspan), geo.cells, 'colspan matches the column count');
    await page.close();
  });
}

async function visualDefects(page, root) {
  return page.evaluate(function (sel) {
    const host = document.querySelector(sel);
    const clipped = [];
    const overlaps = [];
    const els = host.querySelectorAll('*');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el.offsetParent) continue;
      const cs = getComputedStyle(el);
      if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 1) {
        clipped.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
    const blocks = host.querySelectorAll('.account-order-detail-block, .account-order-hero, .account-order-totals');
    for (let b = 0; b < blocks.length; b++) {
      const kids = Array.prototype.filter.call(blocks[b].children, function (k) { return k.offsetParent; });
      for (let i = 1; i < kids.length; i++) {
        const prev = kids[i - 1].getBoundingClientRect();
        const cur = kids[i].getBoundingClientRect();
        if (cur.top < prev.bottom - 2 && cur.left < prev.right - 2 && cur.right > prev.left + 2) {
          overlaps.push({ a: kids[i - 1].tagName, b: kids[i].tagName });
        }
      }
    }
    const totalRows = Array.prototype.map.call(host.querySelectorAll('.account-order-totals p'), function (p) {
      const span = p.querySelector('span');
      const strong = p.querySelector('strong');
      if (!span || !strong) return null;
      const sr = span.getBoundingClientRect();
      const tr = strong.getBoundingClientRect();
      return {
        text: (span.textContent || '').trim().slice(0, 20),
        amountRight: tr.right >= sr.right,
        sameLine: Math.abs(tr.top - sr.top) <= Math.max(sr.height, tr.height)
      };
    }).filter(Boolean);
    return { clipped: clipped, overlaps: overlaps, totalRows: totalRows };
  }, root);
}

for (const width of [320, 390, 768, 1440]) {
  test('customer expanded detail: no clipped text, overlap or totals misalignment at ' + width + 'px', async function () {
    const page = await openCustomer(width);
    await page.click('#order-detail-toggle-orders-37');
    await page.waitForSelector('#order-detail-panel-orders-37 .account-order-totals');
    await page.waitForTimeout(400);
    const res = await visualDefects(page, '#order-detail-panel-orders-37');
    assert.deepStrictEqual(res.clipped, [], width + 'px clipped -> ' + JSON.stringify(res.clipped));
    assert.deepStrictEqual(res.overlaps, [], width + 'px overlaps -> ' + JSON.stringify(res.overlaps));
    assert.ok(res.totalRows.length >= 3, width + 'px totals rows (' + res.totalRows.length + ')');
    for (const row of res.totalRows) {
      assert.strictEqual(row.amountRight, true, width + 'px amount right-aligned for "' + row.text + '"');
      assert.strictEqual(row.sameLine, true, width + 'px label/amount on one line for "' + row.text + '"');
    }
    await page.close();
  });
}

test('expanded panel tracks its content height and collapses back cleanly', async function () {
  const page = await openCustomer(390);
  const before = await page.evaluate(function () { return document.body.scrollHeight; });
  await page.click('#order-detail-toggle-orders-35');
  await page.waitForSelector('#order-detail-panel-orders-35 .account-order-detail-grid');
  await page.waitForTimeout(600);
  const geo = await page.evaluate(function () {
    const p = document.getElementById('order-detail-panel-orders-35');
    let content = 0;
    for (let i = 0; i < p.children.length; i++) content += p.children[i].getBoundingClientRect().height;
    return { panel: Math.round(p.getBoundingClientRect().height), content: Math.round(content) };
  });
  assert.ok(geo.panel - geo.content <= 60, 'panel ' + geo.panel + ' vs content ' + geo.content);
  await page.click('#order-detail-toggle-orders-35');
  await page.waitForTimeout(600);
  const after = await page.evaluate(function () { return document.body.scrollHeight; });
  assert.ok(Math.abs(after - before) <= 4, 'height returns to ' + before + ' (got ' + after + ')');
  await page.close();
});
