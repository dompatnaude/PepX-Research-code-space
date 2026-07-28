'use strict';

const fs = require('fs');
const path = require('path');

function loadProjectEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const candidates = [];

  if (options.envPath) {
    candidates.push(options.envPath);
  } else {
    candidates.push(path.join(cwd, '.env'));
    candidates.push(path.join(cwd, '.env.local'));
    candidates.push(path.join(cwd, '.env.development'));
  }

  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) continue;

    const contents = fs.readFileSync(filePath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex < 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!key || env[key] !== undefined) continue;
      env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }

  return env;
}

module.exports = {
  loadProjectEnv
};
