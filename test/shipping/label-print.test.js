'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const { PDFDocument } = require('pdf-lib');
const {
  PRINT_WIDTH_PT,
  PRINT_HEIGHT_PT,
  computePlacement,
  buildFourBySixLabelPdf,
  buildFourBySixLabelForOrder
} = require('../../services/label-print');

// --- helpers ---------------------------------------------------------------

const CRC_TABLE = (function () {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

// A real, decodable RGB PNG so the raster path is exercised for what it is.
function makePng(width, height) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const value = ((x + y) % 2 === 0) ? 255 : 0;
      const p = rowStart + 1 + x * 3;
      raw[p] = value;
      raw[p + 1] = value;
      raw[p + 2] = value;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// Mimics what EasyPost actually returns for USPS: the 4x6 label dropped onto
// a landscape US Letter canvas.
async function makeOversizedLabelPdf(pngBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]);
  const image = await doc.embedPng(pngBytes);
  page.drawImage(image, { x: 36, y: 90, width: 288, height: 432 });
  return Buffer.from(await doc.save());
}

async function makeNativeFourBySixPdf(pngBytes) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const image = await doc.embedPng(pngBytes);
  page.drawImage(image, { x: 0, y: 0, width: 288, height: 432 });
  return Buffer.from(await doc.save());
}

async function readGeometry(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  return { pageCount: pages.length, mediaBox: pages[0].getMediaBox() };
}

function assertExactFourBySix(geometry) {
  assert.equal(geometry.pageCount, 1, 'the print copy must be a single page');
  assert.equal(geometry.mediaBox.x, 0);
  assert.equal(geometry.mediaBox.y, 0);
  assert.equal(geometry.mediaBox.width, 288, 'MediaBox width must be 288pt');
  assert.equal(geometry.mediaBox.height, 432, 'MediaBox height must be 432pt');
  assert.equal(geometry.mediaBox.width / 72, 4, 'page must be 4.00in wide');
  assert.equal(geometry.mediaBox.height / 72, 6, 'page must be 6.00in tall');
  assert.ok(geometry.mediaBox.height > geometry.mediaBox.width, 'page must be portrait');
}

// --- tests -----------------------------------------------------------------

test('the printed constants are a 4x6 inch page', () => {
  assert.equal(PRINT_WIDTH_PT, 288);
  assert.equal(PRINT_HEIGHT_PT, 432);
});

test('an oversized EasyPost PDF becomes an exact 288x432pt page', async () => {
  const png = makePng(120, 180);
  const built = await buildFourBySixLabelPdf({
    pdfBytes: await makeOversizedLabelPdf(png),
    imageBytes: png
  });
  assertExactFourBySix(await readGeometry(built.bytes));
});

test('an oversized PDF with no raster label is cropped to the label area', async () => {
  const png = makePng(120, 180);
  const built = await buildFourBySixLabelPdf({
    pdfBytes: await makeOversizedLabelPdf(png)
  });
  assert.equal(built.strategy, 'cropped-pdf-page');
  assertExactFourBySix(await readGeometry(built.bytes));
});

test('the carrier raster label alone produces an exact 4x6 page', async () => {
  const built = await buildFourBySixLabelPdf({ imageBytes: makePng(1200, 1800) });
  assert.equal(built.strategy, 'carrier-raster-label');
  assertExactFourBySix(await readGeometry(built.bytes));
});

test('a label EasyPost already returns at 4x6 is copied, not rebuilt', async () => {
  const png = makePng(120, 180);
  const built = await buildFourBySixLabelPdf({
    pdfBytes: await makeNativeFourBySixPdf(png)
  });
  assert.equal(built.strategy, 'native-4x6-page');
  assertExactFourBySix(await readGeometry(built.bytes));
});

test('landscape artwork still prints portrait on a 4x6 page', async () => {
  const built = await buildFourBySixLabelPdf({ imageBytes: makePng(1800, 1200) });
  assertExactFourBySix(await readGeometry(built.bytes));
});

test('artwork is never stretched - the aspect ratio is preserved', () => {
  const portrait = computePlacement(1200, 1800);
  assert.equal(portrait.rotated, false);
  assert.equal(portrait.width / portrait.height, 1200 / 1800);
  assert.ok(portrait.width <= PRINT_WIDTH_PT + 1e-9);
  assert.ok(portrait.height <= PRINT_HEIGHT_PT + 1e-9);

  const landscape = computePlacement(1800, 1200);
  assert.equal(landscape.rotated, true);
  assert.equal(landscape.width / landscape.height, 1800 / 1200);
  // Once turned a quarter turn the artwork still fits inside the 4x6 page.
  assert.ok(landscape.height <= PRINT_WIDTH_PT + 1e-9);
  assert.ok(landscape.width <= PRINT_HEIGHT_PT + 1e-9);
});

test('the order download reads the existing label and never re-buys it', async () => {
  const png = makePng(120, 180);
  const oversized = await makeOversizedLabelPdf(png);
  const forbidden = [];

  const shipments = [
    {
      id: 2,
      providerShipmentId: 'shp_voided',
      labelUrl: 'https://labels.example/voided.pdf',
      purchasedAt: '2026-08-01T00:00:00Z',
      isVoided: true
    },
    {
      id: 1,
      providerShipmentId: 'shp_active',
      labelUrl: 'https://labels.example/active.pdf',
      purchasedAt: '2026-08-02T00:00:00Z',
      isVoided: false
    }
  ];

  const result = await buildFourBySixLabelForOrder({}, 42, {
    loadShipmentsForOrder: async function (db, orderId) {
      assert.equal(orderId, 42);
      return shipments;
    },
    getEasyPostClient: function () {
      return {
        Shipment: {
          retrieve: async function (id) {
            assert.equal(id, 'shp_active');
            return {
              postage_label: {
                label_size: '4x6',
                label_resolution: 300,
                label_url: 'https://labels.example/active.png',
                label_pdf_url: 'https://labels.example/active.pdf'
              }
            };
          },
          create: function () { forbidden.push('create'); },
          buy: function () { forbidden.push('buy'); },
          refund: function () { forbidden.push('refund'); },
          convertLabelFormat: function () { forbidden.push('convertLabelFormat'); }
        }
      };
    },
    fetch: async function (url) {
      const body = url.endsWith('.png') ? png : oversized;
      return { ok: true, arrayBuffer: async function () { return body; } };
    }
  });

  assert.deepEqual(forbidden, [], 'no shipment may be created, bought, converted or voided');
  assert.equal(result.originalLabelUrl, 'https://labels.example/active.pdf');
  assert.equal(result.reportedLabelSize, '4x6');
  assert.equal(result.reportedLabelResolution, 300);
  assertExactFourBySix(await readGeometry(result.bytes));
});

test('an order with no purchased label reports 404 rather than buying one', async () => {
  await assert.rejects(
    buildFourBySixLabelForOrder({}, 7, {
      loadShipmentsForOrder: async function () { return []; },
      getEasyPostClient: function () { throw new Error('EasyPost must not be called'); },
      fetch: async function () { throw new Error('nothing should be fetched'); }
    }),
    function (error) {
      assert.equal(error.status, 404);
      assert.equal(error.code, 'label-not-found');
      return true;
    }
  );
});
