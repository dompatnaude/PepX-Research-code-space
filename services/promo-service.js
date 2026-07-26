function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizePromoCode(code) {
  return String(code || "").trim().toUpperCase();
}

function formatMoney(value) {
  return `$${money(value).toFixed(2)}`;
}

function getPromoPublicError(reason, context) {
  if (reason === "missing_code") return "Please enter a discount code.";
  if (reason === "invalid_code") return "That discount code is not valid.";
  if (reason === "inactive") return "This discount code is inactive.";
  if (reason === "not_started") return "This discount code is not active yet.";
  if (reason === "expired") return "This discount code has expired.";
  if (reason === "usage_limit") return "This discount code has reached its usage limit.";
  if (reason === "per_customer_limit") return "You have already used this discount code the maximum number of times.";
  if (reason === "minimum_order") {
    return `A minimum subtotal of ${formatMoney(context && context.minimum_order)} is required for this discount code.`;
  }
  return "This discount code cannot be applied right now.";
}

function evaluatePromoRow(promoRow, subtotal, now) {
  if (!promoRow) {
    return { valid: false, reason: "invalid_code" };
  }
  if (!promoRow.active) {
    return { valid: false, reason: "inactive" };
  }

  const startsAt = promoRow.starts_at ? new Date(promoRow.starts_at) : null;
  const expiresAt = promoRow.expires_at ? new Date(promoRow.expires_at) : null;

  if (startsAt && now < startsAt) {
    return { valid: false, reason: "not_started" };
  }
  if (expiresAt && now > expiresAt) {
    return { valid: false, reason: "expired" };
  }

  const usageLimit = promoRow.usage_limit == null ? null : Number(promoRow.usage_limit);
  const totalUsed = Number(promoRow.total_used || 0);
  if (usageLimit != null && totalUsed >= usageLimit) {
    return { valid: false, reason: "usage_limit" };
  }

  const minOrder = promoRow.minimum_order == null ? null : money(promoRow.minimum_order);
  const safeSubtotal = money(subtotal);
  if (minOrder != null && safeSubtotal < minOrder) {
    return {
      valid: false,
      reason: "minimum_order",
      context: { minimum_order: minOrder, subtotal: safeSubtotal }
    };
  }

  const discountType = String(promoRow.discount_type || "percentage").toLowerCase();
  const discountValue = money(
    promoRow.discount_value != null ? promoRow.discount_value : promoRow.discount_percent
  );

  let discount = 0;
  if (discountType === "fixed") {
    discount = money(discountValue);
  } else {
    discount = money((safeSubtotal * discountValue) / 100);
  }
  if (discount > safeSubtotal) {
    discount = safeSubtotal;
  }
  const subtotalAfterDiscount = money(safeSubtotal - discount);

  return {
    valid: true,
    promo: promoRow,
    code: normalizePromoCode(promoRow.code),
    discount_type: discountType,
    discount_value: discountValue,
    discount,
    subtotal: safeSubtotal,
    subtotal_after_discount: subtotalAfterDiscount
  };
}

async function getCustomerUsageCount(client, promoCodeId, userId) {
  if (!promoCodeId || !userId) return 0;
  const usageRes = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM promo_code_redemptions
      WHERE promo_code_id = $1
        AND user_id = $2`,
    [promoCodeId, userId]
  );
  return Number((usageRes.rows[0] && usageRes.rows[0].count) || 0);
}

async function findPromoByCode(client, rawCode, options) {
  const opts = options || {};
  const normalizedCode = normalizePromoCode(rawCode);
  if (!normalizedCode) {
    return null;
  }

  const lock = opts.forUpdate ? " FOR UPDATE" : "";
  const result = await client.query(
    `SELECT id, code, discount_type, discount_value, discount_percent, minimum_order, usage_limit, uses_per_customer, total_used, total_discount_given, total_revenue_generated, starts_at, expires_at, active, notes, created_at, updated_at
       FROM promo_codes
      WHERE LOWER(code) = LOWER($1)
      LIMIT 1${lock}`,
    [normalizedCode]
  );
  return result.rows[0] || null;
}

async function validatePromoCode(client, rawCode, subtotal, options) {
  const opts = options || {};
  const normalizedCode = normalizePromoCode(rawCode);
  if (!normalizedCode) {
    return {
      valid: false,
      reason: "missing_code",
      error: getPromoPublicError("missing_code")
    };
  }

  const promoRow = await findPromoByCode(client, normalizedCode, opts);
  const evaluation = evaluatePromoRow(promoRow, subtotal, new Date());
  if (!evaluation.valid) {
    return {
      valid: false,
      reason: evaluation.reason,
      error: getPromoPublicError(evaluation.reason, evaluation.context),
      context: evaluation.context || null,
      code: normalizedCode
    };
  }

  const usesPerCustomer = evaluation.promo.uses_per_customer == null
    ? null
    : Number(evaluation.promo.uses_per_customer);
  if (usesPerCustomer != null && opts.userId) {
    const usedByCustomer = await getCustomerUsageCount(client, evaluation.promo.id, opts.userId);
    if (usedByCustomer >= usesPerCustomer) {
      return {
        valid: false,
        reason: "per_customer_limit",
        error: getPromoPublicError("per_customer_limit"),
        code: normalizedCode
      };
    }
  }

  return {
    valid: true,
    code: evaluation.code,
    promo: evaluation.promo,
    discount_type: evaluation.discount_type,
    discount_value: evaluation.discount_value,
    discount: evaluation.discount,
    subtotal: evaluation.subtotal,
    subtotal_after_discount: evaluation.subtotal_after_discount
  };
}

module.exports = {
  money,
  normalizePromoCode,
  getPromoPublicError,
  evaluatePromoRow,
  findPromoByCode,
  getCustomerUsageCount,
  validatePromoCode,
};
