const express = require("express");
const pool = require("../db/connection");
const { money, normalizePromoCode } = require("../services/promo-service");

function parseOptionalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function parseOptionalInteger(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return NaN;
  return n;
}

function parseOptionalDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

function normalizeDiscountType(value) {
  return String(value || "percentage").trim().toLowerCase();
}

async function getPromoRedemptionColumnAvailability() {
  const result = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'promo_code_redemptions'
        AND column_name = ANY($1::text[])`,
    [["discount_amount", "subtotal_before_discount", "final_total"]]
  );
  const seen = new Set(result.rows.map((r) => String(r.column_name || "").toLowerCase()));
  return {
    hasDiscountAmount: seen.has("discount_amount"),
    hasSubtotalBeforeDiscount: seen.has("subtotal_before_discount"),
    hasFinalTotal: seen.has("final_total"),
  };
}

async function getOrdersColumnAvailability() {
  const result = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = ANY($1::text[])`,
    [["discount_amount", "subtotal_before_discount", "total"]]
  );
  const seen = new Set(result.rows.map((r) => String(r.column_name || "").toLowerCase()));
  return {
    hasDiscountAmount: seen.has("discount_amount"),
    hasSubtotalBeforeDiscount: seen.has("subtotal_before_discount"),
    hasTotal: seen.has("total"),
  };
}

function buildPromoPayload(input, isUpdate) {
  const body = input || {};
  const code = normalizePromoCode(body.code);
  const discountType = normalizeDiscountType(body.discount_type);
  const discountValue = parseOptionalNumber(body.discount_value);
  const minimumOrder = parseOptionalNumber(body.minimum_order);
  const usageLimit = parseOptionalInteger(body.usage_limit);
  const usesPerCustomer = parseOptionalInteger(body.uses_per_customer);
  const startsAt = parseOptionalDate(body.starts_at);
  const expiresAt = parseOptionalDate(body.expires_at);
  const active = body.active == null ? true : !!body.active;
  const notes = body.notes == null ? null : String(body.notes).trim() || null;

  if (!isUpdate || body.code != null) {
    if (!code) return { error: "Discount code is required." };
  }

  if (!isUpdate || body.discount_type != null) {
    if (discountType !== "percentage" && discountType !== "fixed") {
      return { error: "Discount type must be percentage or fixed." };
    }
  }

  if (!isUpdate || body.discount_value != null) {
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return { error: "Discount value must be greater than 0." };
    }
    if (discountType === "percentage" && discountValue > 100) {
      return { error: "Percentage discount cannot exceed 100." };
    }
  }

  if (minimumOrder !== null && (!Number.isFinite(minimumOrder) || minimumOrder < 0)) {
    return { error: "Minimum order cannot be negative." };
  }
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 0)) {
    return { error: "Usage limit must be a non-negative whole number or blank." };
  }
  if (usesPerCustomer !== null && (!Number.isInteger(usesPerCustomer) || usesPerCustomer < 0)) {
    return { error: "Uses per customer must be a non-negative whole number or blank." };
  }
  if (startsAt === "invalid") {
    return { error: "Start date is invalid." };
  }
  if (expiresAt === "invalid") {
    return { error: "Expiration date is invalid." };
  }
  if (startsAt && expiresAt && expiresAt < startsAt) {
    return { error: "Expiration date cannot be earlier than start date." };
  }

  return {
    payload: {
      code: code || null,
      discount_type: discountType,
      discount_value: discountValue == null ? null : money(discountValue),
      minimum_order: minimumOrder == null ? null : money(minimumOrder),
      usage_limit: usageLimit,
      uses_per_customer: usesPerCustomer,
      starts_at: startsAt ? startsAt.toISOString() : null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      active,
      notes,
    }
  };
}

function createAdminPromosRouter(requireAuth) {
  const router = express.Router();

  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
      const role = result.rows.length ? result.rows[0].role : null;
      if (role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      req.adminUserId = userId;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const gate = [requireAuth, requireAdmin];

  router.get("/promos/summary", gate, async (req, res) => {
    try {
      const summaryRes = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE active = true AND (expires_at IS NULL OR expires_at >= NOW()) AND archived_at IS NULL) AS active_codes,
            COALESCE(SUM(total_discount_given), 0) AS total_discounts_given,
            COALESCE(SUM(total_revenue_generated), 0) AS total_revenue_generated
           FROM promo_codes`
      );
      const usageRes = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE redeemed_at >= DATE_TRUNC('day', NOW()))::int AS used_today,
            COUNT(*) FILTER (WHERE redeemed_at >= DATE_TRUNC('week', NOW()))::int AS used_this_week,
            COUNT(*) FILTER (WHERE redeemed_at >= DATE_TRUNC('month', NOW()))::int AS used_this_month
           FROM promo_code_redemptions`
      );

      res.json({
        summary: {
          active_codes: Number(summaryRes.rows[0].active_codes || 0),
          total_discounts_given: Number(summaryRes.rows[0].total_discounts_given || 0),
          total_revenue_generated: Number(summaryRes.rows[0].total_revenue_generated || 0),
          codes_used_today: Number(usageRes.rows[0].used_today || 0),
          codes_used_this_week: Number(usageRes.rows[0].used_this_week || 0),
          codes_used_this_month: Number(usageRes.rows[0].used_this_month || 0),
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load promo summary." });
    }
  });

  router.get("/promos", gate, async (req, res) => {
    try {
      const search = String(req.query.search || "").trim();
      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const params = [];
      const where = [];

      if (search) {
        params.push(`%${search}%`);
        where.push(`code ILIKE $${params.length}`);
      }

      if (statusFilter === "active") {
        where.push(`archived_at IS NULL AND active = true AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at >= NOW()) AND (usage_limit IS NULL OR total_used < usage_limit)`);
      } else if (statusFilter === "inactive") {
        where.push(`archived_at IS NULL AND active = false`);
      } else if (statusFilter === "expired") {
        where.push(`expires_at IS NOT NULL AND expires_at < NOW()`);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const result = await pool.query(
        `SELECT id,
                code,
                discount_type,
                discount_value,
                minimum_order,
                usage_limit,
                uses_per_customer,
                total_used,
                CASE
                  WHEN usage_limit IS NULL THEN NULL
                  ELSE GREATEST(usage_limit - total_used, 0)
                END AS remaining_uses,
                total_discount_given,
                total_revenue_generated,
                starts_at,
                expires_at,
                active,
                archived_at,
                notes,
                created_by,
                updated_by,
                created_at,
                updated_at,
                CASE
                  WHEN archived_at IS NOT NULL THEN 'archived'
                  WHEN active = false THEN 'disabled'
                  WHEN starts_at IS NOT NULL AND starts_at > NOW() THEN 'scheduled'
                  WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 'expired'
                  WHEN usage_limit IS NOT NULL AND total_used >= usage_limit THEN 'usage_limit_reached'
                  ELSE 'active'
                END AS status
           FROM promo_codes
           ${whereSql}
          ORDER BY created_at DESC, id DESC`,
        params
      );
      res.json({ promos: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to list discount codes." });
    }
  });

  router.get("/promos/:id/analytics", gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid promo id." });
      }

      const promoRes = await pool.query(
        `SELECT id, code, discount_type, discount_value, total_used, total_discount_given, total_revenue_generated, created_at, updated_at
           FROM promo_codes
          WHERE id = $1`,
        [id]
      );
      if (!promoRes.rows.length) {
        return res.status(404).json({ error: "Discount code not found." });
      }

      const availability = await getPromoRedemptionColumnAvailability();
      const orderAvailability = await getOrdersColumnAvailability();
      const discountAmountExpr = availability.hasDiscountAmount
        ? "COALESCE(pr.discount_amount, 0)"
        : (orderAvailability.hasDiscountAmount ? "COALESCE(o.discount_amount, 0)" : "0");
      const finalTotalExpr = availability.hasFinalTotal
        ? (orderAvailability.hasTotal ? "COALESCE(pr.final_total, o.total, 0)" : "COALESCE(pr.final_total, 0)")
        : (orderAvailability.hasTotal ? "COALESCE(o.total, 0)" : "0");
      const subtotalBeforeExpr = availability.hasSubtotalBeforeDiscount
        ? "pr.subtotal_before_discount"
        : (orderAvailability.hasSubtotalBeforeDiscount ? "o.subtotal_before_discount" : "NULL");

      const usesOverTimeRes = await pool.query(
        `SELECT DATE_TRUNC('day', pr.redeemed_at) AS day,
                COUNT(*)::int AS uses,
                COALESCE(SUM(${discountAmountExpr}),0) AS discount_given,
                COALESCE(SUM(${finalTotalExpr}),0) AS revenue_generated
           FROM promo_code_redemptions pr
           LEFT JOIN orders o ON o.id = pr.order_id
          WHERE pr.promo_code_id = $1
            AND pr.redeemed_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY 1 ASC`,
        [id]
      );

      const topProductsRes = await pool.query(
        `SELECT oi.product_id,
                oi.name,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue
           FROM promo_code_redemptions pr
           JOIN order_items oi ON oi.order_id = pr.order_id
          WHERE pr.promo_code_id = $1
          GROUP BY oi.product_id, oi.name
          ORDER BY units DESC, revenue DESC
          LIMIT 10`,
        [id]
      );

      const recentRes = await pool.query(
        `SELECT pr.id,
                pr.order_id,
                o.order_number,
                pr.user_id,
                ${discountAmountExpr} AS discount_amount,
                ${subtotalBeforeExpr} AS subtotal_before_discount,
                ${finalTotalExpr} AS final_total,
                pr.redeemed_at
           FROM promo_code_redemptions pr
           LEFT JOIN orders o ON o.id = pr.order_id
          WHERE pr.promo_code_id = $1
          ORDER BY pr.redeemed_at DESC
          LIMIT 20`,
        [id]
      );

      const avgOrderRes = await pool.query(
        `SELECT COALESCE(AVG(${finalTotalExpr}),0) AS average_order_value
           FROM promo_code_redemptions pr
           LEFT JOIN orders o ON o.id = pr.order_id
          WHERE pr.promo_code_id = $1`,
        [id]
      );

      res.json({
        promo: promoRes.rows[0],
        analytics: {
          uses_over_time: usesOverTimeRes.rows,
          top_products: topProductsRes.rows,
          recent_redemptions: recentRes.rows,
          average_order_value: Number(avgOrderRes.rows[0].average_order_value || 0),
          orders_using_code: recentRes.rows,
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load promo analytics." });
    }
  });

  router.post("/promos", gate, async (req, res) => {
    try {
      const built = buildPromoPayload(req.body, false);
      if (built.error) {
        return res.status(400).json({ error: built.error });
      }
      const p = built.payload;
      const result = await pool.query(
        `INSERT INTO promo_codes (
            code,
            discount_type,
            discount_value,
            discount_percent,
            minimum_order,
            usage_limit,
            uses_per_customer,
            starts_at,
            expires_at,
            active,
            notes,
            created_by,
            updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id, code, discount_type, discount_value, minimum_order, usage_limit, uses_per_customer, total_used, total_discount_given, total_revenue_generated, starts_at, expires_at, active, archived_at, notes, created_by, updated_by, created_at, updated_at`,
        [
          p.code,
          p.discount_type,
          p.discount_value,
          p.discount_type === 'percentage' ? p.discount_value : null,
          p.minimum_order,
          p.usage_limit,
          p.uses_per_customer,
          p.starts_at,
          p.expires_at,
          p.active,
          p.notes,
          req.adminUserId,
          req.adminUserId,
        ]
      );
      res.status(201).json({ promo: result.rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        return res.status(409).json({ error: "A discount code with that value already exists." });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to create discount code." });
    }
  });

  router.put("/promos/:id", gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid promo id." });
      }

      const existingRes = await pool.query("SELECT * FROM promo_codes WHERE id = $1", [id]);
      if (!existingRes.rows.length) {
        return res.status(404).json({ error: "Discount code not found." });
      }
      const existing = existingRes.rows[0];

      const built = buildPromoPayload(req.body, true);
      if (built.error) {
        return res.status(400).json({ error: built.error });
      }
      const p = built.payload;

      const code = req.body && req.body.code != null ? p.code : existing.code;
      const discountType = req.body && req.body.discount_type != null
        ? p.discount_type
        : (existing.discount_type || "percentage");
      const discountValue = req.body && req.body.discount_value != null
        ? p.discount_value
        : (existing.discount_value != null ? existing.discount_value : existing.discount_percent);
      const minimumOrder = req.body && Object.prototype.hasOwnProperty.call(req.body, "minimum_order") ? p.minimum_order : existing.minimum_order;
      const usageLimit = req.body && Object.prototype.hasOwnProperty.call(req.body, "usage_limit") ? p.usage_limit : existing.usage_limit;
      const usesPerCustomer = req.body && Object.prototype.hasOwnProperty.call(req.body, "uses_per_customer") ? p.uses_per_customer : existing.uses_per_customer;
      const startsAt = req.body && Object.prototype.hasOwnProperty.call(req.body, "starts_at") ? p.starts_at : existing.starts_at;
      const expiresAt = req.body && Object.prototype.hasOwnProperty.call(req.body, "expires_at") ? p.expires_at : existing.expires_at;
      const active = req.body && Object.prototype.hasOwnProperty.call(req.body, "active") ? p.active : existing.active;
      const notes = req.body && Object.prototype.hasOwnProperty.call(req.body, "notes") ? p.notes : existing.notes;
      const archivedAt = req.body && req.body.archived === true ? new Date().toISOString() : existing.archived_at;

      if (startsAt && expiresAt && new Date(expiresAt) < new Date(startsAt)) {
        return res.status(400).json({ error: "Expiration date cannot be earlier than start date." });
      }

      const discountPercent = discountType === "percentage" ? discountValue : null;

      const result = await pool.query(
        `UPDATE promo_codes
            SET code = $1,
                discount_type = $2,
                discount_value = $3,
                discount_percent = $14,
                minimum_order = $4,
                usage_limit = $5,
                uses_per_customer = $6,
                starts_at = $7,
                expires_at = $8,
                active = $9,
                notes = $10,
                archived_at = $11,
                updated_by = $12,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $13
          RETURNING id, code, discount_type, discount_value, minimum_order, usage_limit, uses_per_customer, total_used, total_discount_given, total_revenue_generated, starts_at, expires_at, active, archived_at, notes, created_by, updated_by, created_at, updated_at`,
        [
          code,
          discountType,
          discountValue,
          minimumOrder,
          usageLimit,
          usesPerCustomer,
          startsAt,
          expiresAt,
          active,
          notes,
          archivedAt,
          req.adminUserId,
          id,
            discountPercent,
        ]
      );

      res.json({ promo: result.rows[0] });
    } catch (error) {
      if (error && error.code === "23505") {
        return res.status(409).json({ error: "A discount code with that value already exists." });
      }
      console.error(error);
      res.status(500).json({ error: "Failed to update discount code." });
    }
  });

  router.delete("/promos/:id", gate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid promo id." });
      }

      const refs = await pool.query(
        `SELECT
            EXISTS(SELECT 1 FROM promo_code_redemptions WHERE promo_code_id = $1) AS has_redemptions,
            EXISTS(SELECT 1 FROM orders WHERE promo_code_id = $1) AS has_orders`,
        [id]
      );
      const existsRes = await pool.query("SELECT id, code FROM promo_codes WHERE id = $1", [id]);
      if (!existsRes.rows.length) {
        return res.status(404).json({ error: "Discount code not found." });
      }

      const hasRedemptions = !!(refs.rows[0] && refs.rows[0].has_redemptions);
      const hasOrders = !!(refs.rows[0] && refs.rows[0].has_orders);

      if (hasRedemptions || hasOrders) {
        const result = await pool.query(
          `UPDATE promo_codes
              SET active = false,
                  archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
                  updated_by = $2,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, code, active, archived_at`,
          [id, req.adminUserId]
        );
        return res.json({ deleted: true, mode: "archived", promo: result.rows[0] });
      }

      const deleted = await pool.query("DELETE FROM promo_codes WHERE id = $1 RETURNING id, code", [id]);
      return res.json({ deleted: true, mode: "hard_delete", promo: deleted.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete discount code." });
    }
  });

  return router;
}

module.exports = createAdminPromosRouter;
