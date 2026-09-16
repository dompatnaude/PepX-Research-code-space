require('dotenv').config();

// Migrations run for real on Vercel, where NODE_ENV=production exempts them.
// Anywhere else they are local-only unless invoked as `npm run hosted:migrate`.
require('../db/require-local-db').requireLocalDatabase({
  context: 'the migration runner',
  hostedAllowed: true,
  hostedCommand: 'hosted:migrate'
});

const { runMigrations } = require('../db/migrate');

runMigrations()
  .then((result) => {
    console.log(`Migrations complete. Total: ${result.total}, Applied: ${result.applied}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
