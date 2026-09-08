'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function startStatic() {
  const server = http.createServer(function (req, res) {
    const url = (req.url || '/').split('?')[0];
    const file = path.join(ROOT, url === '/' ? '/index.html' : url);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

const LONG_EMAIL = 'dana.okonkwo.featherstonehaugh@research-institute-with-a-very-long-domain.example.com';
const LONG_PRODUCT = 'Recombinant Human Fibroblast Growth Factor Basic (bFGF/FGF-2) Carrier-Free Lyophilised Powder, Research Grade';
const LONG_TRACKING = '9400111899223197428574903215558842197';

const USER = { id: 7, name: 'Dana Okonkwo-Featherstonehaugh', email: LONG_EMAIL, provider: 'Email' };

const ORDERS = [
  { id: 35, order_number: 'PX-100035', status: 'shipped', created_at: '2026-08-14T10:00:00Z', total: 1284.5, item_count: 3, shipping_name: USER.name, shipping_email: LONG_EMAIL, tracking_number: LONG_TRACKING, carrier: 'USPS', payment_status: 'paid', fulfillment_status: 'shipped', tracking_status: 'in_transit' },
  { id: 36, order_number: 'PX-100036', status: 'pending_payment', created_at: '2026-08-20T11:30:00Z', total: 96, item_count: 1, shipping_name: USER.name, shipping_email: LONG_EMAIL, tracking_number: null, carrier: null, payment_status: 'pending', fulfillment_status: 'unfulfilled', tracking_status: 'none' },
  { id: 37, order_number: 'PX-100037', status: 'delivered', created_at: '2026-07-02T09:15:00Z', total: 452.75, item_count: 2, shipping_name: USER.name, shipping_email: LONG_EMAIL, tracking_number: '1Z999AA10123456784', carrier: 'UPS', payment_status: 'paid', fulfillment_status: 'delivered', tracking_status: 'delivered' }
];

function orderDetail(id) {
  const base = ORDERS.find(function (o) { return o.id === id; }) || ORDERS[0];
  const withPromo = id === 37;
  return {
    order: Object.assign({}, base, {
      shipping_address: '4820 Northwestern Biomedical Research Parkway, Building C, Suite 1400',
      shipping_city: 'Wolverhampton-on-the-Marsh',
      shipping_state: 'IL',
      shipping_zip: '60614-2287',
      shipping_country: 'United States',
      shipping_phone: '+1 (312) 555-0184 ext. 22071',
      shipping_service: 'USPS Priority Mail Express International',
      shipped_at: base.status === 'shipped' || base.status === 'delivered' ? '2026-08-15T12:00:00Z' : null,
      payment_method: base.status === 'pending_payment' ? 'zelle' : 'card'
    }),
    items: [
      { name: LONG_PRODUCT, variant_name: '5 mg / lyophilised', quantity: 2, price: 412.25 },
      { name: 'Sterile Bacteriostatic Water for Injection USP', variant_name: '30 mL', quantity: 1, price: 96 }
    ],
    totals: {
      subtotal: 920.5,
      subtotal_before_discount: withPromo ? 1020.5 : 920.5,
      discount_amount: withPromo ? 100 : 0,
      promo_code: withPromo ? 'RESEARCH-WELCOME-2026' : '',
      shipping_cost: 34,
      total: base.total
    },
    shipping: {
      tracking_number: base.tracking_number,
      carrier: base.carrier,
      shipping_label_url: base.tracking_number ? '/api/labels/' + base.id + '.pdf' : null,
      shipped_at: base.status === 'shipped' || base.status === 'delivered' ? '2026-08-15T12:00:00Z' : null
    },
    payment: {
      status: base.payment_status === 'paid' ? 'Paid' : 'Pending',
      method: base.status === 'pending_payment' ? 'zelle' : 'Visa ending 4242'
    }
  };
}

function json(body) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function stubAccountApi(page, opts) {
  opts = opts || {};
  const calls = { orders: 0, detail: {} };
  page.__calls = calls;
  await page.route('**/api/**', async function (route) {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const detailMatch = p.match(/^\/api\/orders\/(\d+)$/);
    if (p === '/api/auth/session') return route.fulfill(json({ user: USER }));
    if (p === '/api/account/overview') return route.fulfill(json({ profile: USER }));
    if (p === '/api/orders' && route.request().method() === 'GET') {
      calls.orders += 1;
      return route.fulfill(json(ORDERS));
    }
    if (detailMatch) {
      const id = Number(detailMatch[1]);
      calls.detail[id] = (calls.detail[id] || 0) + 1;
      if (opts.failDetailFor && opts.failDetailFor.indexOf(id) !== -1 && calls.detail[id] <= (opts.failTimes || 99)) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
      }
      if (opts.slowDetail) await new Promise(function (r) { setTimeout(r, opts.slowDetail); });
      return route.fulfill(json(orderDetail(id)));
    }
    return route.fulfill(json({}));
  });
  return calls;
}

module.exports = { startStatic, stubAccountApi, orderDetail, ORDERS, USER, LONG_EMAIL, LONG_PRODUCT, LONG_TRACKING };

const ADMIN_ORDERS = ORDERS.map(function (o) {
  return Object.assign({}, o, { name: o.shipping_name, email: o.shipping_email });
});

function adminDetail(id) {
  const d = orderDetail(id);
  return {
    order: d.order,
    shipping_address: {
      name: d.order.shipping_name,
      street1: d.order.shipping_address,
      city: d.order.shipping_city,
      state: d.order.shipping_state,
      zip: d.order.shipping_zip,
      country: d.order.shipping_country,
      phone: d.order.shipping_phone,
      email: LONG_EMAIL
    },
    items: d.items,
    shipments: id === 35 ? [{ id: 'shp_0', purchasedAt: '2026-08-15T12:00:00Z', trackingNumber: LONG_TRACKING, trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction', labelUrl: '/labels/35.pdf', shipmentStatus: 'In Transit', labelCost: 12.4, isVoided: false, carrier: 'USPS', service: 'Priority Mail' }] : [],
    timeline: [
      { type: 'created', label: 'Order placed', at: '2026-08-14T10:00:00Z' },
      { type: 'paid', label: 'Payment received', at: '2026-08-14T10:05:00Z' }
    ],
    payment_status: d.order.payment_status,
    fulfillment_status: d.order.fulfillment_status,
    totals: d.totals,
    promo_code: d.totals.promo_code,
    discount_amount: d.totals.discount_amount,
    customer: { id: 3, name: d.order.shipping_name, email: LONG_EMAIL }
  };
}

function adminSummary() {
  return {
    orders_count: ADMIN_ORDERS.length,
    revenue_total: 1833.25,
    recent_orders: ADMIN_ORDERS,
    low_stock: [],
    pending_reviews: 0
  };
}

async function stubAdminApi(page, opts) {
  opts = opts || {};
  const calls = { detail: {}, mutations: [] };
  page.__calls = calls;
  await page.route('**/api/**', async function (route) {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const detailMatch = p.match(/^\/api\/admin\/orders\/(\d+)$/);
    const actionMatch = p.match(/^\/api\/admin\/orders\/(\d+)\/(.+)$/);

    if (method !== 'GET') {
      calls.mutations.push(method + ' ' + p + ' ' + (req.postData() || ''));
    }
    if (p === '/api/auth/session') return route.fulfill(json({ user: Object.assign({ role: 'admin', is_admin: true }, USER) }));
    if (p === '/api/admin/summary') return route.fulfill(json(adminSummary()));
    if (p === '/api/admin/orders' && method === 'GET') return route.fulfill(json({ orders: ADMIN_ORDERS }));
    if (detailMatch && method === 'GET') {
      const id = Number(detailMatch[1]);
      calls.detail[id] = (calls.detail[id] || 0) + 1;
      if (opts.failDetailFor && opts.failDetailFor.indexOf(id) !== -1) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
      }
      return route.fulfill(json(adminDetail(id)));
    }
    if (actionMatch) {
      const id = Number(actionMatch[1]);
      const action = actionMatch[2];
      if (action === 'shipping/rates') {
        return route.fulfill(json({ shipment: { providerShipmentId: 'shp_prov_1' }, rates: [{ id: 'rate_1', rateId: 'rate_1', carrier: 'USPS', service: 'Priority', price: 12.4, currency: 'USD' }] }));
      }
      if (action === 'shipping/purchase') {
        return route.fulfill(json({ shipment: { id: 'shp_1', trackingNumber: '9400100000000000000000', labelUrl: '/labels/1.pdf', purchasedAt: '2026-09-01T00:00:00Z' } }));
      }
      if (action === 'shipping/void') return route.fulfill(json({ ok: true }));
      return route.fulfill(json(adminDetail(id)));
    }
    if (/^\/api\/admin\//.test(p)) return route.fulfill(json({ items: [], products: [], customers: [], promos: [], coas: [], reviews: [] }));
    return route.fulfill(json({}));
  });
  return calls;
}

module.exports.ADMIN_ORDERS = ADMIN_ORDERS;
module.exports.adminDetail = adminDetail;
module.exports.adminSummary = adminSummary;
module.exports.stubAdminApi = stubAdminApi;
