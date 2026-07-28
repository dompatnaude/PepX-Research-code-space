# PepX Research Website

This project includes an Express + PostgreSQL backend with session-based authentication, while still serving the storefront pages.

## What Is Included

- Email/password signup and login via backend API
- Password hashing using `bcryptjs`
- Session-based authentication with `express-session`
- PostgreSQL-backed user/session storage
- Migration runner with tracked schema versions (`schema_migrations` table)
- Google OAuth signup/login via Passport (when configured)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Set required values in `.env`:

- `SESSION_SECRET` (required)
- `DATABASE_URL` (required PostgreSQL connection string)
- `NODE_ENV` (`development` locally, `production` on deploy)
- `GOOGLE_CLIENT_ID` (optional for Google auth)
- `GOOGLE_CLIENT_SECRET` (optional for Google auth)
- `GOOGLE_CALLBACK_URL` (optional for Google auth, required if enabling Google login)

4. Start the server:

```bash
npm start
```

To run migrations manually:

```bash
npm run migrate
```

5. Open the site:

- http://localhost:3000/index.html

## Google OAuth Configuration

Google OAuth endpoints used by this app:

- `GET /auth/google`
- `GET /auth/google/callback`

Scopes requested:

- `profile`
- `email`

Expected callback URLs for Google Cloud OAuth credentials:

- Local: `http://localhost:3000/auth/google/callback`
- Production: `https://pepxresearch.com/auth/google/callback`

### Google Cloud Console Setup

1. Open Google Cloud Console and create/select a project.
2. Configure OAuth consent screen (External or Internal, based on your org needs).
3. Add test users while app is in testing mode.
4. Create OAuth 2.0 Client ID credentials of type `Web application`.
5. Add authorized JavaScript origins:
	- `http://localhost:3000`
	- `https://pepxresearch.com`
6. Add authorized redirect URIs:
	- `http://localhost:3000/auth/google/callback`
	- `https://pepxresearch.com/auth/google/callback`
7. Copy client ID and client secret into environment variables:
	- `GOOGLE_CLIENT_ID`
	- `GOOGLE_CLIENT_SECRET`
	- `GOOGLE_CALLBACK_URL`

### Vercel Routing and Sessions

- `vercel.json` rewrites both `/api/*` and `/auth/*` to `api/index.js`, so OAuth callback routes are handled by the same Express app in production.
- `app.set('trust proxy', 1)` is enabled so secure cookies and proxy-aware behavior work correctly behind HTTPS termination.
- Session cookies are configured with `sameSite: 'lax'` and `secure: true` in production.

## Auth API Endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /auth/google`
- `GET /auth/google/callback`

## Notes

- Google auth buttons are functional only when Google OAuth env vars are configured.
- Do not commit `.env` or OAuth secrets.
- Password login remains available for local accounts; OAuth-linked users with no password hash are safely rejected by password login until they set a password.

## Shopify Theme-First Path

If you want Shopify-native integration, use the dedicated theme scaffold in `shopify-theme/`.

- Start with `shopify-theme/README.md`
- Push with Shopify CLI: `shopify theme push --path shopify-theme --store YOUR_STORE.myshopify.com`