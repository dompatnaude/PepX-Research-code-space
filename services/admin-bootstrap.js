'use strict';

const crypto = require('crypto');

async function ensureBootstrapAdmin({ pool, bcrypt, env = process.env, createId = () => crypto.randomUUID() }) {
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD || '').trim();
  const institution = String(env.ADMIN_INSTITUTION || 'PepX').trim();

  if (!email || !password) {
    return { created: false, updated: false, skipped: true };
  }

  const existingRows = await pool.query('SELECT * FROM users WHERE email = $1;', [email]);
  const existing = existingRows.rows[0];

  if (existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `UPDATE users
       SET name = $1, email = $2, institution = $3, provider = $4, password_hash = $5, google_id = $6, role = $7, updated_at = NOW()
       WHERE id = $8;`,
      [existing.name || 'Admin', existing.email || email, institution, existing.provider || 'Email', passwordHash, existing.google_id || null, 'admin', existing.id]
    );
    return { created: false, updated: true, userId: existing.id };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = createId();
  await pool.query(
    `INSERT INTO users (id, name, email, institution, provider, password_hash, google_id, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
    [userId, 'Admin', email, institution, 'Email', passwordHash, null, 'admin']
  );

  return { created: true, updated: false, userId };
}

module.exports = {
  ensureBootstrapAdmin
};
