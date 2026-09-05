'use strict';

// End-to-end checks for the COA upload feature. Needs a running server
// (npm run dev) and admin credentials in .env; it is deliberately NOT part of
// `npm test`, which must stay hermetic.
//
//   node scripts/coa-upload-e2e.js
//
// Everything it creates it deletes again; it asserts at the end that the
// pre-existing COA data is untouched.

require('dotenv').config();
const pool = require('../db/connection');

const BASE = 'http://localhost:3000';
let cookie = '';
let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail) {
  if (cond) { pass++; results.push('PASS  ' + name); }
  else { fail++; results.push('FAIL  ' + name + '  >> ' + (detail || '')); }
}

async function req(path, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers || {});
  if (cookie) options.headers.cookie = cookie;
  options.redirect = 'manual';
  const res = await fetch(BASE + path, options);
  const setC = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setC && setC.length) cookie = setC.map(c => c.split(';')[0]).join('; ');
  return res;
}

async function json(res) { try { return JSON.parse(await res.text()); } catch (e) { return null; } }

// A small but structurally valid PDF.
function pdfBuffer(padKb) {
  const head = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n';
  const tail = '\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  const pad = padKb ? ('%' + 'x'.repeat(padKb * 1024) + '\n') : '';
  return Buffer.from(head + pad + tail, 'latin1');
}
function pngBuffer() {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512, 7)]);
}

function form(fields) {
  const fd = new FormData();
  for (const f of fields) fd.append(f.name, new Blob([f.data], { type: f.type }), f.filename);
  return fd;
}

async function main() {
  // ---- auth ----
  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  ok('00 admin can log in', login.status === 200, 'status ' + login.status);
  if (login.status !== 200) return;

  const prod = await pool.query('SELECT id FROM products WHERE active = true ORDER BY id LIMIT 1');
  const productId = prod.rows[0].id;

  // ---- 6/7 metadata validation ----
  let r = await req('/api/admin/coas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  ok('06 no product selected -> 400', r.status === 400, 'status ' + r.status);

  r = await req('/api/admin/coas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product_id: 999999 }) });
  let b = await json(r);
  ok('07 invalid product id -> 400 Product not found', r.status === 400 && b && /not found/i.test(b.error), 'status ' + r.status);

  // ---- create the draft used by the rest of the run ----
  r = await req('/api/admin/coas', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ product_id: productId, batch_number: 'E2E-TEST-BATCH', lab_name: 'E2E Lab' })
  });
  b = await json(r);
  const coaId = b && b.id;
  ok('.. draft created', r.status === 201 && !!coaId, 'status ' + r.status);
  if (!coaId) return;

  // ---- 5 no file selected ----
  r = await req('/api/admin/coas/' + coaId + '/file', { method: 'POST', body: form([]) });
  b = await json(r);
  ok('05 no file selected -> 400', r.status === 400 && b && /no file/i.test(b.error), 'status ' + r.status + ' ' + JSON.stringify(b));

  // ---- 3 invalid file type (by extension) ----
  r = await req('/api/admin/coas/' + coaId + '/file', {
    method: 'POST', body: form([{ name: 'file', data: Buffer.from('#!/bin/sh\nrm -rf /\n'), type: 'text/plain', filename: 'evil.sh' }])
  });
  b = await json(r);
  ok('03a invalid extension -> 400', r.status === 400 && b && /unsupported/i.test(b.error), 'status ' + r.status + ' ' + JSON.stringify(b));

  // ---- 3b content sniffing: .pdf name, non-PDF bytes ----
  r = await req('/api/admin/coas/' + coaId + '/file', {
    method: 'POST', body: form([{ name: 'file', data: Buffer.from('<html>not a pdf</html>'), type: 'application/pdf', filename: 'fake.pdf' }])
  });
  b = await json(r);
  ok('03b disguised non-PDF -> 400 (content sniffed)', r.status === 400 && b && /not a pdf/i.test(b.error), 'status ' + r.status + ' ' + JSON.stringify(b));

  // ---- 4 oversized ----
  const big = Buffer.concat([pdfBuffer(0), Buffer.alloc(26 * 1024 * 1024, 0x41)]);
  r = await req('/api/admin/coas/' + coaId + '/file', {
    method: 'POST', body: form([{ name: 'file', data: big, type: 'application/pdf', filename: 'huge.pdf' }])
  });
  b = await json(r);
  ok('04 oversized -> 400 with limit message', r.status === 400 && b && /exceeds/i.test(b.error), 'status ' + r.status + ' ' + JSON.stringify(b));

  // no partial record left by any of the failures above
  let row = (await pool.query('SELECT file_storage_key FROM coas WHERE id = $1', [coaId])).rows[0];
  ok('.. failed uploads left no file on the record', row && row.file_storage_key === null, JSON.stringify(row));
  let orphan = (await pool.query('SELECT count(*)::int c FROM coa_files WHERE coa_id = $1', [coaId])).rows[0];
  ok('.. failed uploads left no orphan bytes', orphan.c === 0, JSON.stringify(orphan));

  // ---- 1 valid PDF ----
  const pdf = pdfBuffer(200);
  r = await req('/api/admin/coas/' + coaId + '/file', {
    method: 'POST', body: form([{ name: 'file', data: pdf, type: 'application/pdf', filename: 'Lab Report #1.pdf' }])
  });
  b = await json(r);
  ok('01 valid PDF uploads', r.status === 200 && b && b.ok === true, 'status ' + r.status + ' ' + JSON.stringify(b));
  const storageKey = b && b.storageKey;
  ok('01b filename sanitised', b && b.fileName === 'Lab_Report__1.pdf', JSON.stringify(b && b.fileName));

  row = (await pool.query('SELECT file_storage_key, file_size, file_mime_type FROM coas WHERE id = $1', [coaId])).rows[0];
  ok('01c coas row updated', row.file_storage_key === storageKey && Number(row.file_size) === pdf.length && row.file_mime_type === 'application/pdf', JSON.stringify(row));
  const stored = (await pool.query('SELECT byte_size, mime_type FROM coa_files WHERE storage_key = $1', [storageKey])).rows[0];
  ok('01d bytes stored in database', stored && stored.byte_size === pdf.length, JSON.stringify(stored));

  // ---- admin preview round-trips the exact bytes ----
  r = await req('/api/admin/coas/' + coaId + '/file');
  const back = Buffer.from(await r.arrayBuffer());
  ok('01e admin preview returns identical bytes', r.status === 200 && back.equals(pdf), 'status ' + r.status + ' len ' + back.length);

  // ---- 8 duplicate/replacement upload ----
  const png = pngBuffer();
  r = await req('/api/admin/coas/' + coaId + '/file', {
    method: 'POST', body: form([{ name: 'file', data: png, type: 'image/png', filename: 'scan.png' }])
  });
  b = await json(r);
  const secondKey = b && b.storageKey;
  ok('02/08 replacement upload (PNG) succeeds', r.status === 200 && b.mimeType === 'image/png', JSON.stringify(b));
  const oldGone = (await pool.query('SELECT count(*)::int c FROM coa_files WHERE storage_key = $1', [storageKey])).rows[0];
  ok('08b replaced file removed, no orphan', oldGone.c === 0, JSON.stringify(oldGone));

  // ---- 12 null-field record renders safely ----
  const nullCoa = (await pool.query(
    "INSERT INTO coas (product_id, status) VALUES ($1,'draft') RETURNING id", [productId])).rows[0];
  r = await req('/api/admin/coas?page_size=100');
  b = await json(r);
  ok('12 admin list tolerates a record with null fields', r.status === 200 && Array.isArray(b.coas), 'status ' + r.status);
  ok('12b list reports the upload limit', b && b.limits && b.limits.maxUploadBytes > 0, JSON.stringify(b && b.limits));

  // publishing without a file is refused
  r = await req('/api/admin/coas/' + nullCoa.id + '/publish', { method: 'POST' });
  b = await json(r);
  ok('.. publish without file -> 400', r.status === 400 && /must be uploaded/i.test(b.error), JSON.stringify(b));

  // ---- publish the real one, check the public surface ----
  r = await req('/api/admin/coas/' + coaId + '/publish', { method: 'POST' });
  ok('.. publish succeeds once a file exists', r.status === 200, 'status ' + r.status);

  r = await req('/api/coas');
  b = await json(r);
  ok('.. public list includes the published COA', r.status === 200 && b.coas.some(c => c.id === coaId), 'status ' + r.status);
  ok('.. public payload hides storage keys', b.coas.every(c => !('fileStorageKey' in c) && !('file_storage_key' in c)), 'leak');

  r = await req('/api/coas/' + coaId + '/file');
  const pub = Buffer.from(await r.arrayBuffer());
  ok('.. public file download works', r.status === 200 && pub.equals(png), 'status ' + r.status + ' len ' + pub.length);

  // ---- 13 storage file deleted underneath the record ----
  await pool.query('DELETE FROM coa_files WHERE storage_key = $1', [secondKey]);
  const fs = require('fs');
  const cs = require('../services/coa-storage');
  const dp = cs.safeDiskPath(secondKey);
  if (dp && fs.existsSync(dp)) fs.unlinkSync(dp);
  r = await req('/api/coas/' + coaId + '/file');
  ok('13 missing stored file -> clean 404, no crash', r.status === 404, 'status ' + r.status);
  r = await req('/api/coas');
  ok('13b list still works with a dangling file reference', r.status === 200, 'status ' + r.status);

  // ---- 18/19/20 the rest of the site during COA trouble ----
  for (const [name, path] of [['homepage', '/index.html'], ['catalog', '/shop.html'], ['product', '/product.html'],
                              ['cart/checkout', '/checkout.html'], ['account', '/account.html'], ['admin', '/admin.html'],
                              ['coas page', '/coas.html']]) {
    const rr = await req(path);
    ok('18 ' + name + ' still loads', rr.status === 200, 'status ' + rr.status);
  }
  r = await req('/api/products');
  ok('19 products API unaffected', r.status === 200, 'status ' + r.status);

  // ---- cleanup: remove only what this test created ----
  await req('/api/admin/coas/' + coaId + '/archive', { method: 'POST' });
  let del = await req('/api/admin/coas/' + coaId, { method: 'DELETE' });
  ok('.. test COA deleted', del.status === 200, 'status ' + del.status);
  del = await req('/api/admin/coas/' + nullCoa.id, { method: 'DELETE' });
  ok('.. test null-field COA deleted', del.status === 200, 'status ' + del.status);

  const left = (await pool.query('SELECT count(*)::int c FROM coas')).rows[0];
  ok('.. original COA data untouched (exactly 1 row remains)', left.c === 1, JSON.stringify(left));
  const origFile = (await pool.query("SELECT byte_size FROM coa_files WHERE storage_key = 'dc53e47d-e0bd-41ae-a6f1-0c8d36b0f91d.pdf'")).rows[0];
  ok('.. original COA file still present', origFile && origFile.byte_size === 262152, JSON.stringify(origFile));
}

main()
  .then(() => { console.log(results.join('\n')); console.log('\nPASS ' + pass + '  FAIL ' + fail); return pool.end(); })
  .catch((e) => { console.log(results.join('\n')); console.error('RUNNER ERROR', e && e.stack); pool.end(); process.exitCode = 1; });
