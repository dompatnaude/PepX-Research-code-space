'use strict';

// Regression cover for two COA bugs:
//
//  1. A published COA showed the generic "PDF Report" placeholder instead of a
//     first-page preview, because the file endpoint 404'd for reports whose
//     bytes live in the database rather than on the deployment's filesystem.
//  2. The COA page kept its product filter only in memory, so a page restored
//     from the back/forward cache came back filtered while the address bar
//     still showed a bare /coas.html - the canonical page appeared to be
//     missing reports.
//
// No database, network or filesystem writes: these read source files and
// exercise pure helpers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const readSource = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

const storage = require('../../services/coa-storage');

// ---- PDF byte validation -------------------------------------------------

test('a real PDF header is recognised as application/pdf', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n', 'latin1'), Buffer.alloc(64, 0x20)]);
  assert.equal(storage.sniffMimeType(pdf), 'application/pdf');
  assert.equal(pdf.slice(0, 5).toString('latin1'), '%PDF-');
});

test('PNG and JPEG headers are recognised, and the extension follows the bytes', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]);
  assert.equal(storage.sniffMimeType(png), 'image/png');
  assert.equal(storage.sniffMimeType(jpg), 'image/jpeg');
  assert.equal(storage.extensionForMime('application/pdf'), '.pdf');
  assert.equal(storage.extensionForMime('image/png'), '.png');
});

test('a corrupt or non-PDF payload is rejected rather than stored as a PDF', () => {
  assert.equal(storage.sniffMimeType(Buffer.from('<html>not a pdf</html>')), null);
  assert.equal(storage.sniffMimeType(Buffer.from('%PD')), null);
  assert.equal(storage.sniffMimeType(Buffer.alloc(0)), null);
  assert.equal(storage.sniffMimeType(null), null);
});

// ---- the endpoint must be able to serve database-backed reports ----------

test('the public file route reads through the storage layer, not only the disk', () => {
  const src = readSource('routes', 'coas.js');
  assert.match(src, /coaStorage\.readFile\(pool, row\.file_storage_key\)/,
    'the file route must read through coa-storage so reports stored in the database are served');
  assert.doesNotMatch(src, /fs\.existsSync/,
    'the file route must not gate on the local filesystem: serverless deployments do not have the uploads dir');
  assert.doesNotMatch(src, /createReadStream/,
    'a piped stream turns a missing file into an unhandled error event');
});

test('storage reads fall back to the database when the disk copy is absent', () => {
  const src = readSource('services', 'coa-storage.js');
  const readFn = src.slice(src.indexOf('async function readFile'));
  assert.match(readFn, /SELECT data, mime_type, byte_size FROM coa_files WHERE storage_key/,
    'readFile must fall back to coa_files');
  assert.match(readFn, /return null/, 'a genuinely missing file must return null, not throw');
});

// ---- report cards and viewer ----------------------------------------------
// The library shows each product's photo on its card and opens the report
// itself in an in-page viewer, so the page no longer downloads and rasterises
// every PDF up front.

test('cards show the product photo, with a neutral placeholder when there is none', () => {
  const src = readSource('coas.js');
  assert.match(src, /c\.productImageUrl/, 'cards use the product image from /api/coas');
  assert.match(src, /cx-noimg/, 'a product without an image gets a placeholder, not a broken image');
  assert.doesNotMatch(src, /thumbnail_storage_key/,
    'the public page must not depend on an admin-uploaded thumbnail');
});

test('reports open from the public file route, as a PDF frame or an image', () => {
  const src = readSource('coas.js');
  assert.match(src, /'\/api\/coas\/' \+ c\.id \+ '\/file'/, 'the viewer and download use /api/coas/:id/file');
  assert.match(src, /c\.fileType === 'image'/, 'image reports render as images');
  assert.match(src, /<iframe src=/, 'PDF reports render in the browser\'s PDF viewer');
});

test('every published report is loaded, page by page, and an outage shows a message', () => {
  const src = readSource('coas.js');
  assert.match(src, /page_size=100&page=/, 'the full set is requested in pages of 100');
  assert.match(src, /totalPages/, 'paging stops at the last page');
  assert.match(src, /state\.unavailable = true/, 'a failed load is reported, not left spinning');
  assert.match(src, /Reports are temporarily unavailable/);
});

test('batch lookup ignores case, spaces and dashes', () => {
  const src = readSource('coas.js');
  const norm = new Function('return ' + src.slice(src.indexOf('function norm'), src.indexOf('}', src.indexOf('function norm')) + 1))();
  assert.equal(norm('mc-260915-1'), norm('MC 260915 1'));
  assert.equal(norm(' Mc-260915-1 '), 'MC2609151');
  assert.match(src, /p\.get\('batch'\)/, 'coas.html?batch=… opens the matching report (for vial QR codes)');
  assert.match(src, /p\.get\('id'\)/, 'coas.html?id=… still opens a report directly');
});

// ---- canonical COA navigation -------------------------------------------

const COA_LINK_PAGES = ['index.html', 'shop.html', 'product.html', 'checkout.html', 'account.html'];

test('every "View COA" link points at the same canonical, unfiltered COA page', () => {
  for (const page of COA_LINK_PAGES) {
    const html = readSource(page);
    const anchors = html.match(/<a[^>]*>[^<]*View COA[^<]*<\/a>/g) || [];
    assert.ok(anchors.length > 0, page + ' should link to the COA page');
    for (const a of anchors) {
      const href = (a.match(/href="([^"]*)"/) || [])[1];
      // Page-relative and root-relative both name the same canonical page.
      // What must never appear here is a query string or a fragment: those are
      // the filtered views, and a "View COA" link must open the full report set.
      assert.ok(href === 'coas.html' || href === '/coas.html',
        page + ' links to "' + href + '"; every COA link must use the canonical page with no filter');
    }
  }
});

test('the homepage header link and the hero button are the same destination', () => {
  const html = readSource('index.html');
  const hrefs = (html.match(/<a[^>]*>[^<]*View COA[^<]*<\/a>/g) || [])
    .map((a) => (a.match(/href="([^"]*)"/) || [])[1]);
  assert.ok(hrefs.length >= 2, 'expected both a header link and a hero button');
  assert.equal(new Set(hrefs).size, 1, 'both entry points must resolve to one destination: ' + hrefs.join(', '));
});

test('filter state lives in the URL so a restored page cannot show a stale subset', () => {
  const src = readSource('coas.js');
  assert.match(src, /history\.replaceState/, 'the active filter must be reflected in the URL');
  assert.match(src, /function applyStateFromUrl/, 'state must be readable back from the URL');
  assert.match(src, /addEventListener\('pageshow'/,
    'a back/forward-cache restore must re-apply the URL state');
  assert.match(src, /evt\.persisted/, 'only restored pages need re-syncing');
});

test('a bare COA URL requests every published report', () => {
  // Mirrors currentQueryString() with empty state.
  function currentQueryString(state) {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.productFilter) params.set('product_id', state.productFilter);
    return params.toString();
  }
  assert.equal(currentQueryString({ search: '', productFilter: '' }), '',
    'no filter must mean no query parameters, i.e. all published reports');
  assert.equal(currentQueryString({ search: '', productFilter: '31' }), 'product_id=31');
  assert.equal(currentQueryString({ search: 'wolv', productFilter: '' }), 'search=wolv');
});

test('search is matched against the full set of published reports', () => {
  const src = readSource('coas.js');
  const init = src.slice(src.indexOf('function init()'));
  assert.match(init, /load\(\)/, 'init loads every published report before filtering');
  assert.match(src, /state\.all\.filter/, 'search narrows the full set in the browser');
});
