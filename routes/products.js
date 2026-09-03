const express = require("express");
const router = express.Router();
const pool = require("../db/connection");

// Storefront ordering: in-stock products first, sold-out products last.
// The partition is stable, so the SQL ORDER BY (created_at DESC) still decides
// the order inside the in-stock group and inside the sold-out group.
// It reads the same effective stock_quantity that produces stock_status below,
// so products that only carry stock on their variants are counted correctly.
function sortInStockFirst(items) {
  const inStock = [];
  const soldOut = [];
  for (const item of items) {
    if (Number(item.stock_quantity) > 0) {
      inStock.push(item);
    } else {
      soldOut.push(item);
    }
  }
  return inStock.concat(soldOut);
}

// GET all products (SELECT * includes category)
router.get("/", async (req, res) => {
  try {
    const productsResult = await pool.query(
      `SELECT id, name, slug, description, price, image_url, sku, stock_quantity, category, active, created_at
         FROM products
        WHERE active = true
        ORDER BY created_at DESC`
    );

    const products = productsResult.rows;
    if (!products.length) {
      return res.json([]);
    }

    const productIds = products.map((p) => Number(p.id));
    const variantsResult = await pool.query(
      `SELECT id, product_id, name, price, stock_quantity
         FROM product_variants
        WHERE active = true
          AND product_id = ANY($1::int[])
        ORDER BY id ASC`,
      [productIds]
    );

    const variantsByProductId = new Map();
    for (const row of variantsResult.rows) {
      const key = Number(row.product_id);
      if (!variantsByProductId.has(key)) {
        variantsByProductId.set(key, []);
      }
      variantsByProductId.get(key).push({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        stock_quantity: Number(row.stock_quantity || 0)
      });
    }

    const payload = products.map((p) => {
      const variants = variantsByProductId.get(Number(p.id)) || [];
      const hasVariants = variants.length > 0;
      const stockQty = hasVariants
        ? variants.reduce((sum, v) => sum + Math.max(0, Number(v.stock_quantity || 0)), 0)
        : Math.max(0, Number(p.stock_quantity || 0));
      const stockStatus = stockQty <= 0 ? 'sold_out' : (stockQty <= 5 ? 'low_stock' : 'in_stock');
      const stockMessage = stockQty <= 0 ? 'SOLD OUT' : (stockQty <= 5 ? ('Only ' + stockQty + ' remaining') : '');

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: Number(p.price),
        image_url: p.image_url,
        sku: p.sku,
        stock_quantity: stockQty,
        category: p.category,
        active: p.active,
        created_at: p.created_at,
        stock_status: stockStatus,
        stock_message: stockMessage,
        variants: variants
      };
    });

    res.json(sortInStockFirst(payload));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// GET single product by slug (SELECT * includes category)
router.get("/:slug", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products WHERE slug = $1",
      [req.params.slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// CREATE product (now accepts category)
router.post("/", async (req, res) => {
  try {
    const { name, slug, description, price, image_url, sku, stock_quantity, category } = req.body;
    const result = await pool.query(
      `INSERT INTO products
        (name, slug, description, price, image_url, sku, stock_quantity, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [name, slug, description, price, image_url, sku, stock_quantity, category]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

module.exports = router;
