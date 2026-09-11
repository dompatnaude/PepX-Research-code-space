'use strict';

// ---------------------------------------------------------------------------
// Static-file exposure policy.
//
// server.js serves this entire project directory with express.static, so every
// file that lands in the repo is one request away from being public. The guard
// that used to stand in front of it was a hand-maintained list of five exact
// filenames plus a set of directory prefixes, and the HTML auth gate above it
// only inspects paths ending in `.html`. Anything else in the project root was
// therefore downloadable by anyone: *.bak, *.orderbak, .env.example,
// orders_backup_*.json, create_theme_zip.sh and the theme .zip included.
//
// This module replaces that with three layers. A request has to survive all
// three before express.static is allowed to look for the file on disk:
//
//   1. NON_PUBLIC_PREFIXES / NON_PUBLIC_FILES - the original deny-list, kept
//      as-is: server source, routes, services, SQL, scripts, tests, uploads.
//   2. NON_PUBLIC_PATTERNS - shapes that are never client assets no matter
//      where they appear: dotfiles, every flavour of "bak" suffix, anything
//      whose name contains "backup" or "dump", database files, archives, logs,
//      keys and certificates, and editor leftovers.
//   3. PUBLIC_FILE_EXTENSIONS - an allowlist. A file whose extension is not on
//      it is refused even when no deny rule names it.
//
// Layer 3 is the one that matters for the future: it inverts the default. A new
// backup format, dump extension or credential file committed by accident is not
// served, because "not recognised as a browser asset" now means 404 instead of
// "hand it over". Adding a genuinely new asset type is a deliberate one-line
// change to the allowlist, which is the right place to have that conversation.
//
// Paths with no file extension are classified 'skip', not 'deny': they belong
// to the routes registered above express.static and to the app.get('*')
// fallback. Skipping means express.static never sees them, so they cannot be
// read off disk either - it only means this module is not the thing that
// answers them.
// ---------------------------------------------------------------------------

// Directory prefixes that hold server-side or operational files.
const NON_PUBLIC_PREFIXES = [
  '/routes/', '/services/', '/db/', '/scripts/', '/test/', '/uploads/',
  '/node_modules/', '/.git/', '/api/', '/wordpress-plugin/', '/wordpress-theme/',
  '/shopify-theme/', '/.devcontainer/', '/.vscode/'
];

// Exact files that share an extension with a legitimate client asset and so
// cannot be caught by the allowlist alone (server.js is a .js file).
const NON_PUBLIC_FILES = new Set([
  '/package.json', '/package-lock.json', '/vercel.json', '/server.js',
  '/deploy.sh', '/create_theme_zip.sh'
]);

// Shapes that are never a client asset, wherever they appear in the tree.
const NON_PUBLIC_PATTERNS = [
  // Any "bak" suffix: .bak, .orderbak, .sessbak, .authbak, .cartbak,
  // .bak_bluechange, and timestamped variants such as .productbak.20260721171108
  /(^|\.)[a-z0-9_]*bak[a-z0-9_]*(\.[0-9]+)?$/i,
  // Anything announcing itself as a backup, dump or export of data. The
  // surrounding [^a-z] keeps ordinary words out of it: "orders_backup_1784.json"
  // and "db-dump.sql" match, "dumpling.png" does not.
  /(^|[^a-z])(backup|dump|export)([^a-z]|$)/i,
  // Environment and credential files in any position (.env, prod.env, .env.local).
  /(^|[./])env(\.|$)/i,
  // Database files and archives.
  /\.(sql|sqlite|sqlite3|db|db-shm|db-wal|mdb|bson|dump|gz|tgz|bz2|xz|zip|tar|7z|rar)$/i,
  // Keys, certificates and credential stores.
  /\.(pem|key|crt|cer|der|p12|pfx|jks|keystore|asc|gpg|ppk|ovpn)$/i,
  /(^|[^a-z])(id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials|secrets?|htpasswd)([^a-z]|$)/i,
  // Logs, process and editor leftovers, merge and patch residue.
  /\.(log|pid|swp|swo|orig|rej|patch|diff|tmp|temp|old|save|copy|prev)$/i,
  /~$/,
  // Shell scripts and CI/infra config that occasionally sit in a web root.
  /\.(sh|bash|zsh|ps1|bat|cmd)$/i,
  /^(dockerfile|makefile|procfile)(\.|$)/i
];

// The only extensions a browser legitimately downloads from this site.
const PUBLIC_FILE_EXTENSIONS = new Set([
  // documents and styling
  '.html', '.htm', '.css', '.js', '.mjs', '.txt', '.xml', '.webmanifest',
  // images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp',
  // fonts
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // media and documents users open directly
  '.pdf', '.mp4', '.webm', '.mp3', '.ogg'
]);

/**
 * Decide what express.static is allowed to do with a request path.
 *
 * @param {string} pathname - req.path (no query string, already URL-decoded by Express).
 * @returns {'allow'|'deny'|'skip'}
 *   'allow' - a recognised client asset; hand it to express.static.
 *   'deny'  - must never be served; answer 404 without touching the disk.
 *   'skip'  - not a static file request; leave it to the routes below.
 */
function classifyStaticRequest(pathname) {
  const raw = typeof pathname === 'string' ? pathname : '';
  if (!raw.startsWith('/')) return 'deny';
  if (raw.indexOf('\0') !== -1) return 'deny';

  const lower = raw.toLowerCase();
  if (lower.indexOf('..') !== -1) return 'deny';
  if (lower.indexOf('\\') !== -1) return 'deny';

  if (NON_PUBLIC_FILES.has(lower)) return 'deny';
  if (NON_PUBLIC_PREFIXES.some((prefix) => lower.startsWith(prefix))) return 'deny';

  const basename = lower.slice(lower.lastIndexOf('/') + 1);
  if (basename === '') return 'skip';          // directory request, e.g. "/" or "/assets/"
  if (basename.startsWith('.')) return 'deny'; // .env, .env.production, .npmrc

  if (NON_PUBLIC_PATTERNS.some((pattern) => pattern.test(basename))) return 'deny';

  const dot = basename.lastIndexOf('.');
  if (dot <= 0) return 'skip';                 // extensionless: a route, not a file
  if (!PUBLIC_FILE_EXTENSIONS.has(basename.slice(dot))) return 'deny';

  return 'allow';
}

module.exports = {
  classifyStaticRequest,
  NON_PUBLIC_PREFIXES,
  NON_PUBLIC_FILES,
  NON_PUBLIC_PATTERNS,
  PUBLIC_FILE_EXTENSIONS
};
