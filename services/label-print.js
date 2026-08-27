'use strict';

// Builds a print-ready COPY of a label EasyPost has already produced, on an
// exact 4x6 inch page. Nothing in here purchases, regenerates, converts or
// voids a label, and the artwork EasyPost hosts is never modified - it is
// only read.

const {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
  degrees
} = require('pdf-lib');

// PDF user space is 72 points per inch.
const PRINT_WIDTH_PT = 288; // 4.00 in
const PRINT_HEIGHT_PT = 432; // 6.00 in

// How far a source page may drift from 4x6 and still count as native 4x6.
const SIZE_TOLERANCE_PT = 2;

function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function startsWith(bytes, signature) {
  if (!bytes || bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function isPdf(bytes) { return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); }
function isPng(bytes) { return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]); }
function isJpeg(bytes) { return startsWith(bytes, [0xff, 0xd8, 0xff]); }

function isNativeFourBySix(width, height) {
  return Math.abs(width - PRINT_WIDTH_PT) <= SIZE_TOLERANCE_PT &&
    Math.abs(height - PRINT_HEIGHT_PT) <= SIZE_TOLERANCE_PT;
}

// Fits artwork inside the 4x6 page without ever changing its aspect ratio.
// Landscape artwork is turned a quarter turn so the label prints portrait.
function computePlacement(sourceWidth, sourceHeight) {
  const w = Number(sourceWidth);
  const h = Number(sourceHeight);
  if (!(w > 0) || !(h > 0)) {
    throw new Error('Label artwork has no usable dimensions');
  }

  if (w <= h) {
    const scale = Math.min(PRINT_WIDTH_PT / w, PRINT_HEIGHT_PT / h);
    const drawWidth = w * scale;
    const drawHeight = h * scale;
    return {
      rotated: false,
      scale: scale,
      width: drawWidth,
      height: drawHeight,
      x: (PRINT_WIDTH_PT - drawWidth) / 2,
      y: (PRINT_HEIGHT_PT - drawHeight) / 2
    };
  }

  // Rotated a quarter turn counter-clockwise about (x, y), the artwork lands
  // on x in [x - drawHeight, x] and y in [y, y + drawWidth].
  const scale = Math.min(PRINT_WIDTH_PT / h, PRINT_HEIGHT_PT / w);
  const drawWidth = w * scale;
  const drawHeight = h * scale;
  return {
    rotated: true,
    scale: scale,
    width: drawWidth,
    height: drawHeight,
    x: drawHeight + (PRINT_WIDTH_PT - drawHeight) / 2,
    y: (PRINT_HEIGHT_PT - drawWidth) / 2
  };
}

function drawOptions(placement) {
  const options = {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height
  };
  if (placement.rotated) options.rotate = degrees(90);
  return options;
}

function pinPageToFourBySix(page) {
  page.setMediaBox(0, 0, PRINT_WIDTH_PT, PRINT_HEIGHT_PT);
  page.setCropBox(0, 0, PRINT_WIDTH_PT, PRINT_HEIGHT_PT);
  page.setRotation(degrees(0));
}

// Content-stream tokens: names, numbers and operators.
const CONTENT_TOKEN = /\/[^\s/\[\]()<>]+|[-+]?[0-9]*\.?[0-9]+|[A-Za-z'"*]+/g;
const IDENTITY = [1, 0, 0, 1, 0, 0];

// Concatenates matrix m onto the current transformation matrix.
function concatMatrix(m, ctm) {
  return [
    m[0] * ctm[0] + m[1] * ctm[2],
    m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2],
    m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
    m[4] * ctm[1] + m[5] * ctm[3] + ctm[5]
  ];
}

function readPageContent(page) {
  const context = page.node.context;
  const contents = context.lookup(page.node.get(PDFName.of('Contents')));
  const streams = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const item = context.lookup(contents.get(i));
      if (item instanceof PDFRawStream) streams.push(item);
    }
  } else if (contents instanceof PDFRawStream) {
    streams.push(contents);
  }
  let text = '';
  for (const stream of streams) {
    try {
      text += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') + '\n';
    } catch (error) {
      // An undecodable stream just means we cannot detect a box.
    }
  }
  return text;
}

// Finds where an oversized page actually draws its artwork, so the label can
// be lifted out without guessing at a corner. Walks the page's own graphics
// state (q / Q / cm) and unions the footprint of every XObject it paints.
function findDrawnContentBox(page) {
  let text;
  try {
    text = readPageContent(page);
  } catch (error) {
    return null;
  }
  if (!text) return null;

  let ctm = IDENTITY.slice();
  const stack = [];
  let operands = [];
  let drawn = 0;
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;

  CONTENT_TOKEN.lastIndex = 0;
  let token;
  while ((token = CONTENT_TOKEN.exec(text)) !== null) {
    const value = token[0];
    if (value.charCodeAt(0) === 47) { operands = []; continue; } // "/Name"
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && /[0-9]/.test(value)) {
      operands.push(asNumber);
      continue;
    }
    if (value === 'q') {
      stack.push(ctm.slice());
    } else if (value === 'Q') {
      ctm = stack.pop() || IDENTITY.slice();
    } else if (value === 'cm' && operands.length >= 6) {
      ctm = concatMatrix(operands.slice(operands.length - 6), ctm);
    } else if (value === 'Do') {
      // An XObject is painted over the unit square, mapped through the CTM.
      for (const corner of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = ctm[0] * corner[0] + ctm[2] * corner[1] + ctm[4];
        const y = ctm[1] * corner[0] + ctm[3] * corner[1] + ctm[5];
        if (!isFinite(x) || !isFinite(y)) return null;
        left = Math.min(left, x);
        right = Math.max(right, x);
        bottom = Math.min(bottom, y);
        top = Math.max(top, y);
      }
      drawn++;
    }
    operands = [];
  }
  if (!drawn) return null;

  const width = right - left;
  const height = top - bottom;
  if (!(width > 0) || !(height > 0)) return null;

  const portrait = PRINT_WIDTH_PT / PRINT_HEIGHT_PT;
  const ratio = width / height;
  const nearPortrait = Math.abs(ratio - portrait) / portrait <= 0.08;
  const nearLandscape = Math.abs(ratio * portrait - 1) <= 0.08;
  if (!nearPortrait && !nearLandscape) return null;

  return { left: left, bottom: bottom, right: right, top: top };
}

// Copies a source PDF page onto an exact 4x6 page. Page operators are reused
// as-is, so vector artwork stays vector and text stays text.
async function buildFromPdf(sourceBytes, opts) {
  const allowFullPageFallback = !!(opts && opts.allowFullPageFallback);
  const source = await PDFDocument.load(sourceBytes);
  const pages = source.getPages();
  if (!pages.length) return null;

  const first = pages[0];
  const size = first.getSize();
  const out = await PDFDocument.create();

  if (isNativeFourBySix(size.width, size.height)) {
    const copied = await out.copyPages(source, [0]);
    out.addPage(copied[0]);
    pinPageToFourBySix(copied[0]);
    return {
      bytes: await out.save(),
      strategy: 'native-4x6-page',
      sourceWidth: size.width,
      sourceHeight: size.height
    };
  }

  // The label sits somewhere on an oversized canvas. Read where the page
  // actually draws its artwork rather than guessing at a corner, then lift
  // exactly that region out. embedPage reuses the page's own operators and
  // XObjects, so the label is never redrawn or re-encoded.
  const contentBox = findDrawnContentBox(first);
  if (!contentBox && !allowFullPageFallback) return null;

  const box = contentBox || {
    left: 0,
    bottom: 0,
    right: size.width,
    top: size.height
  };
  const embedded = await out.embedPage(first, box);
  const page = out.addPage([PRINT_WIDTH_PT, PRINT_HEIGHT_PT]);
  pinPageToFourBySix(page);
  page.drawPage(embedded, drawOptions(computePlacement(embedded.width, embedded.height)));
  return {
    bytes: await out.save(),
    strategy: contentBox ? 'cropped-pdf-page' : 'scaled-pdf-page',
    sourceWidth: size.width,
    sourceHeight: size.height
  };
}

// Places the carrier's own raster label on a 4x6 page. The image bytes are
// embedded unchanged, so barcode pixels are never resampled or redrawn.
async function buildFromImage(sourceBytes) {
  const out = await PDFDocument.create();
  let image;
  if (isPng(sourceBytes)) image = await out.embedPng(sourceBytes);
  else if (isJpeg(sourceBytes)) image = await out.embedJpg(sourceBytes);
  else return null;

  const page = out.addPage([PRINT_WIDTH_PT, PRINT_HEIGHT_PT]);
  pinPageToFourBySix(page);
  page.drawImage(image, drawOptions(computePlacement(image.width, image.height)));
  return {
    bytes: await out.save(),
    strategy: 'carrier-raster-label',
    sourceWidth: image.width,
    sourceHeight: image.height
  };
}

// Preference order:
//   1. a PDF EasyPost already returned on a real 4x6 page (best case),
//   2. the label area lifted out of an oversized PDF canvas, reusing the
//      original page objects byte for byte,
//   3. the carrier's own full-resolution raster label,
//   4. the whole oversized page scaled to fit, if nothing else worked.
async function buildFourBySixLabelPdf(source) {
  const pdfBytes = toBytes(source && source.pdfBytes);
  const imageBytes = toBytes(source && source.imageBytes);

  if (isPdf(pdfBytes)) {
    const fromPdf = await buildFromPdf(pdfBytes, { allowFullPageFallback: !imageBytes });
    if (fromPdf) return fromPdf;
  }
  if (imageBytes) {
    const raster = await buildFromImage(imageBytes);
    if (raster) return raster;
  }
  if (isPdf(pdfBytes)) {
    const fallback = await buildFromPdf(pdfBytes, { allowFullPageFallback: true });
    if (fallback) return fallback;
  }

  const error = new Error('No usable EasyPost label artwork was available.');
  error.status = 502;
  error.code = 'label-artwork-unavailable';
  throw error;
}

async function fetchBytes(fetchImpl, url) {
  if (!url) return null;
  const response = await fetchImpl(url);
  if (!response || !response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

// Read-only: loads the order's existing purchased shipment, reads the label
// artwork EasyPost is already hosting, and returns a 4x6 print copy.
async function buildFourBySixLabelForOrder(db, orderId, deps) {
  deps = deps || {};
  const fetchImpl = deps.fetch || globalThis.fetch;
  const loadShipmentsForOrder = deps.loadShipmentsForOrder ||
    require('./shipping-workflow').loadShipmentsForOrder;
  const getEasyPostClient = deps.getEasyPostClient ||
    require('./easypost').getEasyPostClient;

  const shipments = await loadShipmentsForOrder(db, orderId);
  const shipment = (shipments || []).find(function (row) {
    return row && row.purchasedAt && !row.isVoided && row.labelUrl;
  });
  if (!shipment) {
    const error = new Error('This order does not have a purchased shipping label.');
    error.status = 404;
    error.code = 'label-not-found';
    throw error;
  }

  let postageLabel = null;
  if (shipment.providerShipmentId) {
    try {
      const client = getEasyPostClient();
      const remote = await client.Shipment.retrieve(shipment.providerShipmentId);
      postageLabel = (remote && remote.postage_label) || null;
    } catch (error) {
      postageLabel = null;
    }
  }

  const pdfUrl = (postageLabel && postageLabel.label_pdf_url) || shipment.labelUrl;
  const imageUrl = postageLabel && postageLabel.label_url;
  const fetched = await Promise.all([
    fetchBytes(fetchImpl, pdfUrl),
    imageUrl && imageUrl !== pdfUrl ? fetchBytes(fetchImpl, imageUrl) : null
  ]);

  const built = await buildFourBySixLabelPdf({ pdfBytes: fetched[0], imageBytes: fetched[1] });
  return {
    bytes: built.bytes,
    strategy: built.strategy,
    sourceWidth: built.sourceWidth,
    sourceHeight: built.sourceHeight,
    shipment: shipment,
    originalLabelUrl: shipment.labelUrl,
    reportedLabelSize: (postageLabel && postageLabel.label_size) || null,
    reportedLabelResolution: (postageLabel && postageLabel.label_resolution) || null
  };
}

module.exports = {
  PRINT_WIDTH_PT,
  PRINT_HEIGHT_PT,
  computePlacement,
  buildFourBySixLabelPdf,
  buildFourBySixLabelForOrder
};
