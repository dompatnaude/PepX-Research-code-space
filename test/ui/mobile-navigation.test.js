'use strict';

// The public mobile navigation.
//
// Below 900px styles.css hides nav.menu unless it carries `open`, so a page
// that renders the nav without a control to add that class has no reachable
// navigation at all on a phone. That was true of every server-rendered page and
// of three of the policy pages. These tests pin the control, its semantics and
// its behaviour so the combination cannot drift apart again.
//
// The browser half drives the real rendered markup with the real stylesheet and
// the real script, via setContent rather than a booted app, so it needs no
// database and no session.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const REPO = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const CSS = path.join(REPO, 'styles.css');
const NAV_JS = path.join(REPO, 'public-nav.js');

const { renderShopPage } = require('../../services/public-page');
const SERVER = read('server.js');
const PUBLIC_NAV = read('public-nav.js');

// Static pages whose nav is the collapsing `menu` component. Each needs the
// control, the id the control points at, and the script that binds them.
const STATIC_PAGES = [
  'coas.html', 'terms-conditions.html', 'refund-policy.html', 'shipping-policy.html'
];

const CATS = [{ name: 'Repair', slug: 'repair', path: '/shop/repair' }];
const page = () => renderShopPage({
  origin: 'https://pepxresearch.com', products: [], categories: CATS, category: null
});

// --- markup and semantics ---------------------------------------------------

test('the rendered header carries a real button with the right semantics', () => {
  const html = page();
  const m = html.match(/<button[^>]*id="mobileMenuToggle"[^>]*>/);
  assert.ok(m, 'no mobile menu button in the rendered header');
  const tag = m[0];
  assert.match(tag, /type="button"/, 'must not submit anything');
  assert.match(tag, /class="[^"]*\bmobile-nav-toggle\b/, 'needs the class styles.css shows at mobile');
  assert.match(tag, /aria-expanded="false"/, 'must start closed');
  assert.match(tag, /aria-controls="site-menu"/, 'must point at the nav it controls');
  assert.match(tag, /aria-label="[^"]+"/, 'needs an accessible name; it has no text');
  assert.ok(html.includes('id="site-menu"'), 'aria-controls points at a missing element');
});

test('the rendered page loads the public nav script and never the signed-in bundle', () => {
  const html = page();
  assert.match(html, /<script src="\/public-nav\.js" defer><\/script>/);
  assert.doesNotMatch(html, /script\.js/, 'the signed-in storefront bundle must stay private');
});

test('every static page with a collapsing nav has the control, the id and the script', () => {
  for (const file of STATIC_PAGES) {
    const html = read(file);
    assert.ok(/<nav class="menu"[^>]*id="site-menu"/.test(html) ||
      /<nav[^>]*id="site-menu"[^>]*class="menu"/.test(html), file + ' nav has no id="site-menu"');
    assert.match(html, /id="mobileMenuToggle"/, file + ' has no menu button');
    assert.match(html, /aria-controls="site-menu"/, file + ' button does not point at the nav');
    assert.match(html, /public-nav\.js/, file + ' does not load the nav script');
  }
});

test('the signed-out homepage is served the nav script', () => {
  assert.match(SERVER, /<script src="\/public-nav\.js" defer><\/script>/,
    'server.js no longer injects public-nav.js into the signed-out homepage');
});

test('the nav script is the only copy of this behaviour', () => {
  // Duplicated toggles drift. public-home.js and coas.js used to carry their
  // own; if either binds the button again the two handlers cancel each other
  // out and the menu stops opening.
  for (const file of ['public-home.js', 'coas.js']) {
    const src = read(file);
    assert.doesNotMatch(src, /mobileMenuToggle'?\)?\s*;?[\s\S]{0,200}addEventListener\('click'/,
      file + ' binds the menu button again');
  }
});

test('the nav script reads no session state and touches no private route', () => {
  assert.doesNotMatch(PUBLIC_NAV, /fetch\(|XMLHttpRequest|document\.cookie|localStorage|sessionStorage/,
    'the nav script must stay a pure UI toggle');
  assert.doesNotMatch(PUBLIC_NAV, /\/api\/|account\.html|checkout\.html|admin\.html|script\.js/,
    'the nav script references a private surface');
});

// --- the links it exposes ---------------------------------------------------

test('the menu exposes the public destinations and nothing gated', () => {
  const html = page();
  const nav = html.slice(html.indexOf('<nav class="menu"'), html.indexOf('</nav>'));
  const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  for (const want of ['/', '/shop', '/blog', '/coas.html', '/#faq', '/#about']) {
    assert.ok(hrefs.includes(want), 'menu is missing ' + want);
  }
  // Signed-out chrome offers the login page, never the account page behind it.
  assert.ok(hrefs.includes('/login.html'), 'menu has no way to sign in');

  for (const href of hrefs) {
    assert.doesNotMatch(href, /(^|\/)(shop|product|account|checkout|admin|order-confirmation)\.html/i,
      'menu links a gated page: ' + href);
    assert.doesNotMatch(href, /^\/api\//i, 'menu links an API: ' + href);
    assert.doesNotMatch(href, /^(https?:)?\/\//i, 'menu links off-site: ' + href);
  }
});

test('the category dropdown still lists only public catalogue routes', () => {
  const html = page();
  const nav = html.slice(html.indexOf('<nav class="menu"'), html.indexOf('</nav>'));
  assert.ok(nav.includes('href="/shop/repair"'), 'category links are gone from the menu');
  assert.doesNotMatch(nav, /shop\.html\?category/, 'the dropdown fell back to the gated catalogue');
});

// --- behaviour in a real browser --------------------------------------------

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function open(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const pg = await ctx.newPage();
  await pg.setContent(page(), { waitUntil: 'domcontentloaded' });
  await pg.addStyleTag({ path: CSS });
  await pg.addScriptTag({ path: NAV_JS });
  await pg.waitForTimeout(60);
  return { ctx, pg };
}
const state = (pg) => pg.evaluate(() => ({
  btn: (() => { const b = document.querySelector('.mobile-nav-toggle');
    return b ? getComputedStyle(b).display !== 'none' : false; })(),
  nav: getComputedStyle(document.getElementById('site-menu')).display !== 'none',
  aria: document.querySelector('.mobile-nav-toggle').getAttribute('aria-expanded'),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
}));

test('at 390px the button is visible, the nav starts closed, and tapping toggles it', async () => {
  const { ctx, pg } = await open(390);
  let s = await state(pg);
  assert.equal(s.btn, true, 'menu button is not visible at 390px');
  assert.equal(s.nav, false, 'nav should start closed');
  assert.equal(s.aria, 'false');
  assert.equal(s.overflow, false, 'horizontal overflow at 390px');

  await pg.click('.mobile-nav-toggle');
  s = await state(pg);
  assert.equal(s.nav, true, 'tapping did not open the menu');
  assert.equal(s.aria, 'true', 'aria-expanded did not follow the menu open');

  await pg.click('.mobile-nav-toggle');
  s = await state(pg);
  assert.equal(s.nav, false, 'tapping again did not close the menu');
  assert.equal(s.aria, 'false', 'aria-expanded did not follow the menu closed');
  await ctx.close();
});

test('the open menu is reachable and operable from the keyboard', async () => {
  const { ctx, pg } = await open(390);
  await pg.focus('.mobile-nav-toggle');
  await pg.keyboard.press('Enter');
  let s = await state(pg);
  assert.equal(s.nav, true, 'Enter did not activate the button');
  assert.equal(s.aria, 'true');

  const links = await pg.evaluate(() =>
    [...document.querySelectorAll('#site-menu a')].filter((a) => a.offsetParent !== null).length);
  assert.ok(links >= 6, 'only ' + links + ' reachable links in the open menu');

  await pg.keyboard.press('Escape');
  s = await state(pg);
  assert.equal(s.nav, false, 'Escape did not close the menu');
  assert.equal(s.aria, 'false');
  const focused = await pg.evaluate(() =>
    document.activeElement && document.activeElement.classList.contains('mobile-nav-toggle'));
  assert.equal(focused, true, 'focus was not returned to the button');
  await ctx.close();
});

test('a tap outside the open menu closes it', async () => {
  const { ctx, pg } = await open(390);
  await pg.click('.mobile-nav-toggle');
  assert.equal((await state(pg)).nav, true);
  await pg.mouse.click(10, 700);
  assert.equal((await state(pg)).nav, false, 'clicking away did not close the menu');
  await ctx.close();
});

test('at 1440px the desktop nav is visible and the button is not', async () => {
  const { ctx, pg } = await open(1440);
  const s = await state(pg);
  assert.equal(s.btn, false, 'the mobile button leaked into the desktop header');
  assert.equal(s.nav, true, 'the desktop nav is not visible');
  assert.equal(s.overflow, false, 'horizontal overflow at 1440px');
  await ctx.close();
});

test('the menu cannot be left open across a viewport change', async () => {
  const { ctx, pg } = await open(390);
  await pg.click('.mobile-nav-toggle');
  assert.equal((await state(pg)).nav, true);

  await pg.setViewportSize({ width: 1440, height: 900 });
  await pg.waitForTimeout(200);
  const wide = await pg.evaluate(() => ({
    open: document.getElementById('site-menu').classList.contains('open'),
    aria: document.querySelector('.mobile-nav-toggle').getAttribute('aria-expanded')
  }));
  assert.equal(wide.open, false, 'the open class survived the move to desktop');
  assert.equal(wide.aria, 'false', 'aria-expanded went stale at desktop width');

  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.waitForTimeout(200);
  assert.equal((await state(pg)).nav, false, 'the menu was already open on returning to mobile');
  await ctx.close();
});

test('no horizontal overflow at any tested width, and the logo never meets the button', async () => {
  for (const width of [390, 430, 768, 1440]) {
    const { ctx, pg } = await open(width);
    const m = await pg.evaluate(() => {
      const de = document.documentElement;
      const logo = document.querySelector('.logo');
      const btn = document.querySelector('.mobile-nav-toggle');
      const shown = btn && getComputedStyle(btn).display !== 'none';
      return {
        overflow: de.scrollWidth > de.clientWidth + 1,
        collide: shown ? logo.getBoundingClientRect().right > btn.getBoundingClientRect().left + 1 : false
      };
    });
    assert.equal(m.overflow, false, width + 'px: horizontal overflow');
    assert.equal(m.collide, false, width + 'px: the logo overlaps the menu button');
    await ctx.close();
  }
});
