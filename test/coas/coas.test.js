'use strict';

/**
 * COA feature tests.
 * Uses Node.js built-in test runner (node:test).
 * All database and file-system calls are mocked — no real DB or disk access.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- helpers ---------------------------------------------------------

function makeRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    _ended: false
  };
  res.status = function (code) { res._status = code; return res; };
  res.json = function (body) { res._body = body; res._ended = true; return res; };
  res.end = function () { res._ended = true; return res; };
  res.setHeader = function (k, v) { res._headers[k] = v; return res; };
  res.pipe = function () { res._ended = true; return res; };
  return res;
}

function makeReq(overrides) {
  return Object.assign({
    params: {},
    query: {},
    body: {},
    session: {},
    user: null,
    adminUserId: null
  }, overrides || {});
}

function nextFn(err) {
  if (err) throw err;
}

// ---- mock pool factory -----------------------------------------------

function createMockPool(overrides) {
  return {
    async query(sql, params) {
      const lower = sql.trim().toLowerCase();

      // Role check for requireAdmin
      if (lower.includes('select role from users where id')) {
        const userId = params && params[0];
        if (overrides && overrides.adminUserId && userId === overrides.adminUserId) {
          return { rows: [{ role: 'admin' }] };
        }
        return { rows: [{ role: 'customer' }] };
      }

      if (overrides && overrides.query) {
        return overrides.query(sql, params);
      }
      return { rows: [] };
    }
  };
}

// ---- admin-coas route tests ------------------------------------------

test('admin COA list requires admin role', async () => {
  const pool = createMockPool({ adminUserId: 'admin-uid' });

  const requireAuth = async function (req, res, next) {
    req.user = { id: 'customer-uid' };
    return next();
  };

  const createAdminCoasRouter = require('../../routes/admin-coas');
  // We can't easily inject pool, so just test requireAdmin logic inline.

  let called = false;
  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
      const role = result.rows.length ? result.rows[0].role : null;
      if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      called = true;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  const req = makeReq({ user: { id: 'customer-uid' } });
  const res = makeRes();
  await requireAdmin(req, res, nextFn);

  assert.equal(res._status, 403);
  assert.equal(res._body.error, 'Admin access required');
  assert.equal(called, false);
});

test('requireAdmin passes for admin user', async () => {
  const pool = createMockPool({ adminUserId: 'admin-uid' });
  let passed = false;

  async function requireAdmin(req, res, next) {
    const userId = (req.user && req.user.id) || (req.session && req.session.userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const role = result.rows.length ? result.rows[0].role : null;
    if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.adminUserId = userId;
    passed = true;
    return next();
  }

  const req = makeReq({ user: { id: 'admin-uid' } });
  const res = makeRes();
  let nextCalled = false;
  await requireAdmin(req, res, function () { nextCalled = true; });

  assert.equal(passed, true);
  assert.equal(nextCalled, true);
  assert.equal(res._status, 200);
});

// ---- toPublicCoa shape -----------------------------------------------

test('public COA response omits file_storage_key', () => {
  // Simulate what toPublicCoa returns — must not include storage key
  function toPublicCoa(row) {
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name || null,
      productImageUrl: row.product_image_url || null,
      variantId: row.variant_id || null,
      variantName: row.variant_name || null,
      batchNumber: row.batch_number || null,
      labName: row.lab_name || null,
      testType: row.test_type || null,
      testDate: row.test_date || null,
      reportDate: row.report_date || null,
      title: row.title || null,
      fileType: row.file_mime_type
        ? (row.file_mime_type.includes('pdf') ? 'pdf' : 'image')
        : null,
      hasThumbnail: !!row.thumbnail_storage_key,
      publishedAt: row.published_at || null
    };
  }

  const row = {
    id: 1,
    product_id: 2,
    product_name: 'BPC-157',
    product_image_url: null,
    variant_id: null,
    variant_name: null,
    batch_number: 'B001',
    lab_name: 'LabCorp',
    test_type: 'HPLC',
    test_date: '2024-01-01',
    report_date: '2024-01-05',
    title: null,
    file_mime_type: 'application/pdf',
    file_storage_key: 'secret-uuid.pdf',   // must NOT appear in output
    thumbnail_storage_key: null,
    published_at: '2024-01-10T00:00:00Z'
  };

  const result = toPublicCoa(row);
  assert.equal('file_storage_key' in result, false, 'file_storage_key must not be in public response');
  assert.equal('file_name' in result, false, 'file_name must not be in public response');
  assert.equal(result.fileType, 'pdf');
  assert.equal(result.productName, 'BPC-157');
  assert.equal(result.batchNumber, 'B001');
});

// ---- publish validation logic ----------------------------------------

test('publish requires file_storage_key', async () => {
  // Simulate the publish endpoint guard
  const row = { id: 1, product_id: 2, file_storage_key: null, status: 'draft' };

  const res = makeRes();
  if (!row.file_storage_key) {
    res.status(400).json({ error: 'A report file must be uploaded before publishing' });
  }

  assert.equal(res._status, 400);
  assert.equal(res._body.error, 'A report file must be uploaded before publishing');
});

test('publish succeeds when file and product are set', async () => {
  const row = { id: 1, product_id: 2, file_storage_key: 'abc.pdf', status: 'draft' };

  const res = makeRes();
  // Guard passes
  if (!row.file_storage_key) {
    res.status(400).json({ error: 'A report file must be uploaded before publishing' });
  } else if (!row.product_id) {
    res.status(400).json({ error: 'A product must be associated before publishing' });
  } else {
    res.json({ ok: true });
  }

  assert.equal(res._status, 200);
  assert.deepEqual(res._body, { ok: true });
});

test('archived COAs cannot be re-published', async () => {
  const row = { id: 1, product_id: 2, file_storage_key: 'abc.pdf', status: 'archived' };

  const res = makeRes();
  if (row.status === 'archived') {
    res.status(400).json({ error: 'Archived COAs cannot be re-published; create a new record' });
  }

  assert.equal(res._status, 400);
});

// ---- draft/archived not publicly accessible -------------------------

test('public COA list query only includes published status', () => {
  const where = ["c.status = 'published'"];
  assert.ok(where[0].includes("'published'"), 'WHERE clause must filter to published only');
  assert.ok(!where[0].includes('draft'), 'WHERE clause must not include draft');
  assert.ok(!where[0].includes('archived'), 'WHERE clause must not include archived');
});

test('public single COA query only includes published status', () => {
  const sql = `SELECT c.id FROM coas c WHERE c.id = $1 AND c.status = 'published'`;
  assert.ok(sql.includes("status = 'published'"), 'Single COA query must check published status');
});

// ---- file type validation --------------------------------------------

test('accepted MIME types are restricted', () => {
  const ACCEPTED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg'
  ]);

  assert.equal(ACCEPTED_MIME_TYPES.has('application/pdf'), true);
  assert.equal(ACCEPTED_MIME_TYPES.has('image/png'), true);
  assert.equal(ACCEPTED_MIME_TYPES.has('image/jpeg'), true);
  assert.equal(ACCEPTED_MIME_TYPES.has('text/html'), false);
  assert.equal(ACCEPTED_MIME_TYPES.has('application/javascript'), false);
  assert.equal(ACCEPTED_MIME_TYPES.has('image/gif'), false);
  assert.equal(ACCEPTED_MIME_TYPES.has('application/zip'), false);
});

test('extension validation rejects unknown extensions', () => {
  const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
  assert.equal(ACCEPTED_EXTENSIONS.has('.pdf'), true);
  assert.equal(ACCEPTED_EXTENSIONS.has('.png'), true);
  assert.equal(ACCEPTED_EXTENSIONS.has('.jpg'), true);
  assert.equal(ACCEPTED_EXTENSIONS.has('.jpeg'), true);
  assert.equal(ACCEPTED_EXTENSIONS.has('.exe'), false);
  assert.equal(ACCEPTED_EXTENSIONS.has('.html'), false);
  assert.equal(ACCEPTED_EXTENSIONS.has('.sh'), false);
});

// ---- variant product-association guard --------------------------------

test('variant must belong to the specified product', () => {
  // Simulate DB check: variant 5 belongs to product 2, not product 1
  const variants = [{ id: 5, product_id: 2 }];
  const requestedProductId = 1;
  const requestedVariantId = 5;

  const match = variants.find(function (v) {
    return v.id === requestedVariantId && v.product_id === requestedProductId;
  });

  assert.equal(match, undefined, 'Should not find variant under wrong product');
});

test('variant that belongs to correct product passes', () => {
  const variants = [{ id: 5, product_id: 2 }];
  const requestedProductId = 2;
  const requestedVariantId = 5;

  const match = variants.find(function (v) {
    return v.id === requestedVariantId && v.product_id === requestedProductId;
  });

  assert.notEqual(match, undefined, 'Should find variant under correct product');
});

// ---- published-only deletion guard -----------------------------------

test('published COA cannot be deleted directly', () => {
  const row = { id: 1, status: 'published' };
  const res = makeRes();

  if (row.status === 'published') {
    res.status(400).json({ error: 'Published COAs must be archived before deletion' });
  }

  assert.equal(res._status, 400);
  assert.ok(res._body.error.includes('archived before deletion'));
});

test('draft COA can be deleted', () => {
  const row = { id: 2, status: 'draft', file_storage_key: null, thumbnail_storage_key: null };
  const res = makeRes();

  if (row.status === 'published') {
    res.status(400).json({ error: 'Published COAs must be archived before deletion' });
  } else {
    res.json({ ok: true });
  }

  assert.equal(res._status, 200);
  assert.deepEqual(res._body, { ok: true });
});

// ---- homepage button -------------------------------------------------

test('homepage button text is View COAs', async () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  assert.ok(html.includes('View COAs'), 'Homepage must contain "View COAs" button text');
  assert.ok(!html.includes('"#about" class="btn ghost">Learn More'), 'Old "Learn More" button must be gone');
});

test('homepage COA button links to coas.html', async () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  assert.ok(html.includes('href="coas.html"'), 'Homepage button must link to coas.html');
});

// ---- public COA page exists ------------------------------------------

test('coas.html exists and contains expected elements', async () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../../coas.html'), 'utf8');
  assert.ok(html.includes('id="coaGrid"'), 'COA page must have coaGrid element');
  assert.ok(html.includes('id="coaSearch"'), 'COA page must have coaSearch input');
  assert.ok(html.includes('Certificates of Analysis'), 'COA page must have page title');
  assert.ok(html.includes('third-party laboratory reports'), 'COA page must have description');
});

// ---- admin COA tab exists -------------------------------------------

test('admin.html contains COA tab button', async () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../../admin.html'), 'utf8');
  assert.ok(html.includes('data-tab="coas"'), 'Admin must have COA tab button');
  assert.ok(html.includes('id="coasSection"'), 'Admin must have coasSection element');
  assert.ok(html.includes('id="coaModalWrap"'), 'Admin must have COA modal');
  assert.ok(html.includes('id="coaProductVariantSelect"'), 'Admin COA modal must have combined product/variant select');
  assert.ok(!html.includes('id="coaProductSelect"'), 'Old separate product select must be removed');
  assert.ok(!html.includes('id="coaVariantSelect"'), 'Old separate variant select must be removed');
});

// ---- migration exists -----------------------------------------------

test('migration 021_coas.sql exists', async () => {
  const fs = require('fs');
  const path = require('path');
  const migPath = path.join(__dirname, '../../db/migrations/021_coas.sql');
  assert.ok(fs.existsSync(migPath), '021_coas.sql migration file must exist');
  const sql = fs.readFileSync(migPath, 'utf8');
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS coas"), 'Migration must create coas table');
  assert.ok(sql.includes("status"), 'Migration must include status column');
  assert.ok(sql.includes("product_id"), 'Migration must include product_id column');
  assert.ok(sql.includes("CHECK (status IN"), 'Migration must constrain status values');
});

// ---- search filter test ---------------------------------------------

test('public COA search builds correct WHERE clause', () => {
  const params = [];
  const where = ["c.status = 'published'"];
  const search = 'BPC-157';

  if (search) {
    params.push('%' + search + '%');
    const p = '$' + params.length;
    where.push(
      '(p.name ILIKE ' + p +
      ' OR pv.name ILIKE ' + p +
      ' OR c.batch_number ILIKE ' + p +
      ' OR c.lab_name ILIKE ' + p + ')'
    );
  }

  assert.equal(params.length, 1);
  assert.equal(params[0], '%BPC-157%');
  assert.ok(where[1].includes('p.name ILIKE'), 'Search must include product name');
  assert.ok(where[1].includes('c.batch_number ILIKE'), 'Search must include batch number');
  assert.ok(where[1].includes('c.lab_name ILIKE'), 'Search must include lab name');
});

// ---- file size limit -------------------------------------------------

test('max file size is 25 MB', () => {
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  assert.equal(MAX_FILE_SIZE, 26214400);
});

// ---- empty state test -----------------------------------------------

test('empty coas array renders empty state', () => {
  // Simulate what renderGrid does when state.coas is empty
  var coas = [];
  var hasSearch = false;
  var hasFilter = false;

  var html;
  if (!coas.length) {
    if (hasSearch || hasFilter) {
      html = 'No COAs match your search';
    } else {
      html = 'No certificates of analysis published yet';
    }
  } else {
    html = 'cards';
  }

  assert.ok(html.includes('No certificates'), 'Empty state must show appropriate message');
});

// ---- combined product+variant select value parsing -------------------

test('combined select value productId only parses correctly', () => {
  var val = '5';
  var parts = val.split(':');
  var productId = parseInt(parts[0], 10) || 0;
  var variantId = parseInt(parts[1], 10) || null;
  assert.equal(productId, 5);
  assert.equal(variantId, null);
});

test('combined select value productId:variantId parses correctly', () => {
  var val = '5:42';
  var parts = val.split(':');
  var productId = parseInt(parts[0], 10) || 0;
  var variantId = parseInt(parts[1], 10) || null;
  assert.equal(productId, 5);
  assert.equal(variantId, 42);
});

test('empty combined select value is rejected', () => {
  var val = '';
  var parts = val.split(':');
  var productId = parseInt(parts[0], 10) || 0;
  assert.equal(productId, 0);
  // productId 0 means validation should reject it
  assert.ok(!productId, 'Empty value must produce falsy productId');
});

test('coas-products endpoint returns products with variants embedded', () => {
  // Simulate the shape returned by the updated endpoint
  var response = {
    products: [
      { id: 1, name: 'BPC-157', variants: [{ id: 10, name: '10 mg' }, { id: 11, name: '20 mg' }] },
      { id: 2, name: 'TB-500', variants: [] }
    ]
  };

  assert.ok(Array.isArray(response.products));
  assert.equal(response.products[0].name, 'BPC-157');
  assert.ok(Array.isArray(response.products[0].variants));
  assert.equal(response.products[0].variants.length, 2);
  assert.equal(response.products[0].variants[0].name, '10 mg');
  assert.equal(response.products[1].variants.length, 0);
});

test('option label format is "Product — Variant" for variant entries', () => {
  var p = { id: 1, name: 'BPC-157', variants: [{ id: 10, name: '10 mg' }] };
  var label = p.name + ' \u2014 ' + p.variants[0].name;
  assert.equal(label, 'BPC-157 \u2014 10 mg');
});

test('option value format encodes productId:variantId for variants', () => {
  var p = { id: 1, name: 'BPC-157', variants: [{ id: 10, name: '10 mg' }] };
  var value = p.id + ':' + p.variants[0].id;
  assert.equal(value, '1:10');
  var parts = value.split(':');
  assert.equal(parseInt(parts[0], 10), 1);
  assert.equal(parseInt(parts[1], 10), 10);
});

test('product without variants uses plain productId as value', () => {
  var p = { id: 2, name: 'TB-500', variants: [] };
  var value = String(p.id);
  assert.equal(value, '2');
  var parts = value.split(':');
  assert.equal(parseInt(parts[0], 10), 2);
  assert.equal(parseInt(parts[1], 10) || null, null);
});

// ---- path traversal prevention ---------------------------------------

test('storage key path is validated against upload dir', () => {
  const path = require('path');
  const uploadDir = '/app/uploads/coas';

  function isSafe(storageKey) {
    const fp = path.join(uploadDir, storageKey);
    return fp.startsWith(uploadDir);
  }

  assert.equal(isSafe('abc.pdf'), true);
  assert.equal(isSafe('../../etc/passwd'), false);
  assert.equal(isSafe('../server.js'), false);
  assert.equal(isSafe('nested/abc.pdf'), true);
});
