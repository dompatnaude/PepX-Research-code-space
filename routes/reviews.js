'use strict';

const express = require('express');
const pool = require('../db/connection');

// ---- Limits & helpers ---------------------------------------------------
const MAX_NAME_LEN = 80;
const MAX_EMAIL_LEN = 254;
const MAX_REVIEW_LEN = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip control chars and any angle-bracket markup so nothing can be
// stored that would execute as HTML/script when rendered later.
function sanitizeText(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

function normalizeEmail(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

// Public display name: first name + last initial, e.g. "John D."
function publicDisplayName(name) {
  const clean = sanitizeText(name);
  if (!clean) return 'Verified Researcher';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return parts[0] + ' ' + last.charAt(0).toUpperCase() + '.';
}

function toPublicReview(row) {
  return {
    id: row.id,
    rating: row.rating,
    review_text: row.review_text,
    name: publicDisplayName(row.name),
    created_at: row.created_at
  };
  // NOTE: email is intentionally never included in the public payload.
}

// ---- Simple in-memory rate limiter (per IP) -----------------------------
// Basic spam protection for public submissions.
const RATE_LIMIT_MAX = 5;            // max submissions
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // per minute
const rateBuckets = new Map();

function rateLimitSubmit(req, res, next) {
  const ip = (req.ip || req.connection?.remoteAddress || 'unknown').toString();
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many reviews submitted. Please try again later.' });
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return next();
}

// ---- Public router: /api/reviews ----------------------------------------
function createReviewsRouter(deps) {
  deps = deps || {};
  const db = deps.pool || pool;
  const router = express.Router();

  // GET /api/reviews -> only approved, newest first, no email exposed.
  router.get('/', async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT id, name, rating, review_text, created_at FROM reviews WHERE approved = TRUE ORDER BY created_at DESC, id DESC'
      );
      return res.json({ reviews: result.rows.map(toPublicReview) });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/reviews -> create a new (always unapproved) review.
  router.post('/', rateLimitSubmit, async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = sanitizeText(body.name);
      const email = normalizeEmail(body.email);
      const reviewText = sanitizeText(body.review_text != null ? body.review_text : body.message);
      const rating = parseInt(body.rating, 10);

      if (!name) return res.status(400).json({ error: 'Name is required.' });
      if (name.length > MAX_NAME_LEN) return res.status(400).json({ error: 'Name is too long.' });
      if (!email || !EMAIL_RE.test(email) || email.length > MAX_EMAIL_LEN) {
        return res.status(400).json({ error: 'A valid email is required.' });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
      }
      if (!reviewText) return res.status(400).json({ error: 'Review text is required.' });
      if (reviewText.length > MAX_REVIEW_LEN) return res.status(400).json({ error: 'Review text is too long.' });

      // The server ALWAYS forces approved = FALSE. The client cannot set it.
      const inserted = await db.query(
        'INSERT INTO reviews (name, email, rating, review_text, approved) VALUES ($1, $2, $3, $4, FALSE) RETURNING id, created_at',
        [name, email, rating, reviewText]
      );
      return res.status(201).json({
        ok: true,
        id: inserted.rows[0].id,
        message: 'Thank you! Your review has been submitted and is awaiting approval.'
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

// ---- Admin router: mounted under /api/admin ------------------------------
// Mirrors the auth model used by routes/admin.js:
//   requireAuth  -> confirms an authenticated session/user
//   requireAdmin -> confirms that user's role === 'admin' (checked in the DB)
// Every moderation route is gated by BOTH, verified on the backend, so a
// normal customer or unauthenticated visitor cannot moderate reviews even by
// calling the API directly.
function createAdminReviewsRouter(requireAuth, deps) {
  deps = deps || {};
  const db = deps.pool || pool;
  const router = express.Router();

  async function requireAdmin(req, res, next) {
    try {
      const userId = (req.user && req.user.id) || (req.session && req.session.userId);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const result = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
      const role = result.rows.length ? result.rows[0].role : null;
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      req.adminUserId = userId;
      return next();
    } catch (error) {
      return next(error);
    }
  }

  const gate = [requireAuth, requireAdmin];

  // GET /api/admin/reviews[?status=pending|approved]
  // Admin view includes the email (needed for moderation).
  router.get('/reviews', gate, async (req, res, next) => {
    try {
      const status = String((req.query.status || '')).trim().toLowerCase();
      let where = '';
      if (status === 'pending') where = 'WHERE approved = FALSE';
      else if (status === 'approved') where = 'WHERE approved = TRUE';
      const result = await db.query(
        'SELECT id, name, email, rating, review_text, created_at, approved FROM reviews ' +
          where + ' ORDER BY created_at DESC, id DESC'
      );
      return res.json({ reviews: result.rows });
    } catch (err) {
      return next(err);
    }
  });

  // PATCH /api/admin/reviews/:id/approve -> set approved = TRUE
  router.patch('/reviews/:id/approve', gate, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid review id.' });
      const result = await db.query(
        'UPDATE reviews SET approved = TRUE WHERE id = $1 RETURNING id, approved',
        [id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Review not found.' });
      return res.json({ ok: true, review: result.rows[0] });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/admin/reviews/:id -> permanently remove (pending or approved)
  router.delete('/reviews/:id', gate, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid review id.' });
      const result = await db.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Review not found.' });
      return res.json({ ok: true, id: result.rows[0].id });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createReviewsRouter, createAdminReviewsRouter };
