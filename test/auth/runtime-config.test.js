'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadProjectEnv } = require('../../services/runtime-config');

test('loads admin credentials from a project .env file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pepx-env-'));
  const envPath = path.join(tmpDir, '.env');
  fs.writeFileSync(envPath, 'ADMIN_EMAIL=local-admin@example.com\nADMIN_PASSWORD=local-password\n', 'utf8');

  const env = {};
  loadProjectEnv({ cwd: tmpDir, env });

  assert.equal(env.ADMIN_EMAIL, 'local-admin@example.com');
  assert.equal(env.ADMIN_PASSWORD, 'local-password');
});
