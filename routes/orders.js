const express = require("express");
const pool = require("../db/connection");
const { money, validatePromoCode } = require("../services/promo-service");

function getQuantityDiscountRate(quantity) {
  const qty = Number(quantity) || 0;
  if (qty >= 10) return 0.20;
  if (qty >= 5) return 0.12;
  if (qty === 4) return 0.09;
  if (qty === 3) return 0.06;
  if (qty === 2) return 0.03;
  return 0;
}

async function getCartId(client, userId, lockRow) {
  const lockClause = lockRow ? " FOR UPDATE" : "";
  const cartRes = await client.query(
    `SELECT id FROM carts WHERE user_id = $1 ORDER BY id ASC LIMIT 1${lockClause}`,
    [userId]
  );
  if (!cartRes.rows.length) {
    return null;
  }
  return cartRes.rows[0].id;
}

async function loadCartItems(client, cartId) {
  const itemsRes = await client.query(
    `SELECT ci.product_id,
            ci.variant_id,
            ci.quantity,
            p.name AS product_name,
            p.price AS product_price,
            p.stock_quantity AS product_stock,
            p.active AS product_active,
            pv.id AS variant_row_id,
            pv.name AS variant_name,
            pv.price AS variant_price,
            pv.stock_quantity AS variant_stock,
            pv.active AS variant_active
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       LEFT JOIN product_variants pv
         ON pv.id = ci.variant_id
        AND pv.product_id = p.id
      WHERE ci.cart_id = $1
      ORDER BY ci.id ASC`,
    [cartId]
  );
  return itemsRes.rows;
}

async function lockAndValidateInventory(client, items) {
  const productById = new Map();
  const variantById = new Map();

  for (const it of items) {
    const productId = Number(it.product_id);
    if (!productById.has(productId)) {
      const lockedProduct = await client.query(
        "SELECT id, stock_quantity, active FROM products WHERE id = $1 FOR UPDATE",
        [productId]
      );
      if (!lockedProduct.rows.length) {
        return { ok: false };
      }
      const p = lockedProduct.rows[0];
      productById.set(productId, {
        stock_quantity: Number(p.stock_quantity || 0),
        active: !!p.active,
      });
    }

    if (it.variant_id != null) {
      const variantId = Number(it.variant_id);
      if (!variantById.has(variantId)) {
        const lockedVariant = await client.query(
          `SELECT id, product_id, stock_quantity, active, name, price
             FROM product_variants
            WHERE id = $1
              AND product_id = $2
            FOR UPDATE`,
          [variantId, productId]
        );
        if (!lockedVariant.rows.length) {
          return { ok: false };
        }
        const v = lockedVariant.rows[0];
        variantById.set(variantId, {
          stock_quantity: Number(v.stock_quantity || 0),
          active: !!v.active,
          name: v.name,
          price: Number(v.price),
        });
      }
    }
  }

  for (const it of items) {
    const productId = Number(it.product_id);
    const requestedQty = Number(it.quantity || 0);
    const product = productById.get(productId);
    if (!product || !product.active) {
      return { ok: false };
    }

    if (it.variant_id != null) {
      const variant = variantById.get(Number(it.variant_id));
      if (!variant || !variant.active || variant.stock_quantity < requestedQty) {
        return { ok: false };
      }
    } else if (product.stock_quantity < requestedQty) {
      return { ok: false };
    }
  }

  return { ok: true, variantById };
}

function priceCartItems(items, variantById) {
  const pricedItems = [];
  let subtotal = 0;

  for (const it of items) {
    const quantity = Number(it.quantity) || 0;
    const hasVariant = it.variant_id != null;
    const variant = hasVariant && variantById ? variantById.get(Number(it.variant_id)) : null;
    const basePrice = hasVariant
      ? Number((variant && variant.price) || it.variant_price || 0)
      : Number(it.product_price) || 0;
    const discountRate = getQuantityDiscountRate(quantity);
    const discountedUnitPrice = money(basePrice * (1 - discountRate));
    const lineTotal = money(discountedUnitPrice * quantity);
    subtotal += lineTotal;

    pricedItems.push({
      product_id: it.product_id,
      variant_id: hasVariant ? Number(it.variant_id) : null,
      name: it.product_name,
      variant_name: variant ? variant.name : it.variant_name || null,
      variant_price: variant ? money(variant.price) : (it.variant_price != null ? money(it.variant_price) : null),
      quantity,
      discount_rate: discountRate,
      discounted_unit_price: discountedUnitPrice,
      line_total: lineTotal,
    });
  }

  return {
    pricedItems,
    subtotal: money(subtotal),
  };
}

async function buildUserCartSubtotal(client, userId) {
  const cartId = await getCartId(client, userId, false);
  if (!cartId) {
    return { cartId: null, subtotal: 0, pricedItems: [] };
  }
  const items = await loadCartItems(client, cartId);
  if (!items.length) {
    return { cartId, subtotal: 0, pricedItems: [] };
  }
  const pricing = priceCartItems(items, null);
  return { cartId, subtotal: pricing.subtotal, pricedItems: pricing.pricedItems };
}

function createOrdersRouter(requireAuth) {
  const router = express.Router();

  router.post("/validate-promo", (req, res, next) => {
    if (!req.user && !(req.session && req.session.userId)) {
      return res.status(401).json({ valid: false, error: "Please sign in to apply a discount code." });
    }
    requireAuth(req, res, function () {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ valid: false, error: "Please sign in to apply a discount code." });
      }
      validatePromoForCheckout(req, res).catch(next);
    });
  });

  router.post("/", (req, res, next) => {
    if (!req.user && !(req.session && req.session.userId)) {
      return res.status(401).json({ error: "Login required to place order" });
    }
    requireAuth(req, res, function () {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Login required to place order" });
      }
      createOrder(req, res).catch(next);
    });
  });

  router.get("/", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, order_number, status, total, created_at
           FROM orders
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [req.user.id]
      );
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  router.get("/:id", requireAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: "Invalid order id" });
      }
      const orderRes = await pool.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
        [orderId, req.user.id]
      );
      if (orderRes.rows.length === 0) {
        return res.status(404).json({ error: "Order not found" });
      }
      const order = orderRes.rows[0];
      const itemsRes = await pool.query(
        `SELECT id, product_id, variant_id, name, variant_name, variant_price, price, quantity
           FROM order_items
          WHERE order_id = $1
          ORDER BY id ASC`,
        [order.id]
      );
      res.json({
        order,
        items: itemsRes.rows,
        totals: {
          subtotal: order.subtotal,
          subtotal_before_discount: order.subtotal_before_discount,
          discount_amount: order.discount_amount,
          promo_code: order.promo_code,
          shipping_cost: order.shipping_cost,
          total: order.total,
        },
        payment: {
          method: order.payment_method || null,
          status: order.status === "pending_payment" ? "Pending" : "Paid"
        },
        shipping: {
          tracking_number: order.tracking_number || null,
          carrier: order.carrier || null,
          shipping_label_url: order.shipping_label_url || null,
          shipped_at: order.shipped_at || null
        },
        status: order.status,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  return router;
}

async function validatePromoForCheckout(req, res) {
  const userId = req.user.id;
  const rawCode = req.body && req.body.code;

  const client = await pool.connect();
  try {
    const cart = await buildUserCartSubtotal(client, userId);
    if (!cart.pricedItems.length) {
      return res.status(400).json({ valid: false, error: "Your cart is empty." });
    }

    const promoResult = await validatePromoCode(client, rawCode, cart.subtotal, { forUpdate: false, userId });
    if (!promoResult.valid) {
      return res.status(400).json({ valid: false, error: promoResult.error });
    }

    return res.json({
      valid: true,
      code: promoResult.code,
      discount_type: promoResult.discount_type,
      discount_value: promoResult.discount_value,
      discount: promoResult.discount,
      subtotal: promoResult.subtotal,
      subtotal_after_discount: promoResult.subtotal_after_discount,
    });
  } finally {
    client.release();
  }
}

async function createOrder(req, res) {
  const userId = req.user.id;
  const body = req.body || {};
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cartId = await getCartId(client, userId, true);
    if (!cartId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cart is empty" });
    }

    const items = await loadCartItems(client, cartId);
    if (!items.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Cart is empty" });
    }

    const inventory = await lockAndValidateInventory(client, items);
    if (!inventory.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "One or more products are no longer available in the requested quantity.",
      });
    }

    const pricing = priceCartItems(items, inventory.variantById);
    const subtotalBeforeDiscount = money(pricing.subtotal);
    const shippingCost = money(body.shipping_cost || 0);

    let promoCodeId = null;
    let promoCode = null;
    let discountAmount = 0;
    let subtotalAfterDiscount = subtotalBeforeDiscount;

    const submittedPromoCode = String(body.promo_code || "").trim();
    if (submittedPromoCode) {
      const promoResult = await validatePromoCode(client, submittedPromoCode, subtotalBeforeDiscount, { forUpdate: true, userId });
      if (!promoResult.valid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: promoResult.error });
      }

      promoCodeId = promoResult.promo.id;
      promoCode = promoResult.code;
      discountAmount = money(promoResult.discount);
      subtotalAfterDiscount = money(promoResult.subtotal_after_discount);
    }

    const total = money(subtotalAfterDiscount + shippingCost);
    const shippingCountry = String(body.shipping_country || "").trim() || null;
    const shippingPhone = String(body.shipping_phone || "").trim() || null;
    const paymentMethod = String(body.payment_method || "").trim() || null;

    const tempOrderNumber = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const insertRes = await client.query(
      `INSERT INTO orders (
          order_number,
          user_id,
          status,
          subtotal,
          shipping_cost,
          total,
          shipping_name,
          shipping_email,
          shipping_address,
          shipping_city,
          shipping_state,
          shipping_zip,
          shipping_country,
          shipping_phone,
          payment_method,
          promo_code,
          promo_code_id,
          discount_amount,
          subtotal_before_discount
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id`,
      [
        tempOrderNumber,
        userId,
        "pending_payment",
        subtotalBeforeDiscount,
        shippingCost,
        total,
        body.shipping_name || null,
        body.shipping_email || null,
        body.shipping_address || null,
        body.shipping_city || null,
        body.shipping_state || null,
        body.shipping_zip || null,
        shippingCountry,
        shippingPhone,
        paymentMethod,
        promoCode,
        promoCodeId,
        discountAmount,
        subtotalBeforeDiscount,
      ]
    );

    const orderId = insertRes.rows[0].id;
    const finalOrderNumber = `PX${String(Number(orderId) + 100000).padStart(6, "0")}`;
    const orderRes = await client.query(
      `UPDATE orders SET order_number = $1 WHERE id = $2 RETURNING id, order_number, status`,
      [finalOrderNumber, orderId]
    );
    const order = orderRes.rows[0];

    if (!order) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "Could not create order" });
    }

    for (const it of pricing.pricedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, name, variant_name, variant_price, price, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.id,
          it.product_id,
          it.variant_id,
          it.name,
          it.variant_name,
          it.variant_price,
          it.discounted_unit_price,
          it.quantity,
        ]
      );
    }

    for (const it of pricing.pricedItems) {
      if (it.variant_id != null) {
        await client.query(
          `UPDATE product_variants
              SET stock_quantity = stock_quantity - $1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
          [it.quantity, it.variant_id]
        );
      } else {
        await client.query(
          `UPDATE products
              SET stock_quantity = stock_quantity - $1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
          [it.quantity, it.product_id]
        );
      }
    }

    if (promoCodeId != null && discountAmount > 0) {
      await client.query(
        `INSERT INTO promo_code_redemptions (
            promo_code_id,
            user_id,
            order_id,
            discount_amount,
            subtotal_before_discount,
            final_total
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [promoCodeId, userId, order.id, discountAmount, subtotalBeforeDiscount, total]
      );

      await client.query(
        `UPDATE promo_codes
            SET total_used = total_used + 1,
                total_discount_given = total_discount_given + $1,
                total_revenue_generated = total_revenue_generated + $2,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $3`,
        [discountAmount, total, promoCodeId]
      );
    }

    await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
    await client.query(
      "UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [cartId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      totals: {
        subtotal: subtotalAfterDiscount,
        subtotal_before_discount: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        promo_code: promoCode,
        shipping_cost: shippingCost,
        total,
      },
      items: pricing.pricedItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.name,
        variant_name: item.variant_name,
        variant_price: item.variant_price,
        quantity: item.quantity,
        discount_rate: item.discount_rate,
        unit_price: item.discounted_unit_price,
        line_total: item.line_total,
      })),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Failed to create order" });
  } finally {
    client.release();
  }
}

module.exports = createOrdersRouter;
