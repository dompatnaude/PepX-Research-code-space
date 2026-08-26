'use strict';

// Test fixtures for the local dev database.
//
// Everything is prefixed "ZZ TEST" and uses ids in the 9000 range so it sorts
// away from real data and is obvious in the admin panel. The point is to give
// the Delete button something safe to act on that still has the history a real
// record would have: an order line, a promo redemption and a COA.

require('dotenv').config();
const { isLocalConnection, connectionHost } = require('../db/is-local-connection');

if (!isLocalConnection(process.env.DATABASE_URL)) {
  console.error('Refusing to seed: DATABASE_URL is not local (' + connectionHost(process.env.DATABASE_URL) + ').');
  process.exit(1);
}

const pool = require('../db/connection');

const ADMIN_ID = 'zz-test-customer';

async function seed() {
  await pool.query(
    `INSERT INTO users (id, name, email, institution, provider, role)
     VALUES ($1, 'ZZ Test Customer', 'zz-test-customer@example.test', 'PepX', 'Email', 'user')
     ON CONFLICT (id) DO NOTHING`,
    [ADMIN_ID]
  );

  await pool.query(
    `INSERT INTO products (id, name, slug, description, price, category, stock_quantity, active)
     VALUES (9001, 'ZZ TEST Product (has order history)', 'zz-test-product-with-history',
             'Safe to delete. Exists to exercise the admin Delete button.', 49.99, 'Test', 5, true),
            (9002, 'ZZ TEST Product (no history)', 'zz-test-product-clean',
             'Safe to delete. No orders reference this one.', 19.99, 'Test', 5, true)
     ON CONFLICT (id) DO UPDATE SET active = true, name = EXCLUDED.name`
  );

  await pool.query(
    `INSERT INTO promo_codes (id, code, discount_type, discount_value, discount_percent, active, notes)
     VALUES (9001, 'ZZTESTUSED', 'percentage', 10, 10, true, 'Safe to delete. Has a redemption behind it.'),
            (9002, 'ZZTESTUNUSED', 'percentage', 15, 15, true, 'Safe to delete. Never redeemed.')
     ON CONFLICT (id) DO UPDATE SET active = true, archived_at = NULL`
  );

  await pool.query(
    `INSERT INTO orders (id, order_number, user_id, status, subtotal, total,
                         promo_code_id, discount_amount, subtotal_before_discount)
     VALUES (9001, 'ZZ-TEST-9001', $1, 'processing', 44.99, 44.99, 9001, 5.00, 49.99)
     ON CONFLICT (id) DO UPDATE SET promo_code_id = 9001, promo_code = NULL`,
    [ADMIN_ID]
  );

  await pool.query(
    `INSERT INTO order_items (id, order_id, product_id, name, price, quantity)
     VALUES (9001, 9001, 9001, 'ZZ TEST Product (has order history)', 49.99, 2)
     ON CONFLICT (id) DO UPDATE SET product_id = 9001`
  );

  await pool.query(
    `INSERT INTO promo_code_redemptions (id, promo_code_id, user_id, order_id, discount_amount)
     VALUES (9001, 9001, $1, 9001, 5.00)
     ON CONFLICT (id) DO UPDATE SET promo_code_id = 9001, promo_code = NULL`,
    [ADMIN_ID]
  );

  await pool.query(
    `INSERT INTO coas (id, product_id, batch_number, lab_name, status)
     VALUES (9001, 9001, 'ZZ-TEST-BATCH-1', 'ZZ Test Lab', 'published')
     ON CONFLICT (id) DO UPDATE SET product_id = 9001, product_name = NULL, product_slug = NULL`
  );

  console.log('');
  console.log('Seeded into ' + connectionHost(process.env.DATABASE_URL) + ':');
  console.log('  Products       9001 ZZ TEST Product (has order history)  <- order line + COA behind it');
  console.log('                 9002 ZZ TEST Product (no history)');
  console.log('  Discount codes 9001 ZZTESTUSED    <- redemption + order behind it');
  console.log('                 9002 ZZTESTUNUSED');
  console.log('  Order          ZZ-TEST-9001  total 44.99, discount 5.00');
  console.log('');
  console.log('Delete any of them in the admin panel, then re-run this command to put them back.');
  console.log('');
}

seed()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    return pool.end().finally(() => process.exit(1));
  });
