/**
 * Jest `setupFiles` entry — runs in every worker BEFORE any module under test
 * is required, which is exactly what we need: `config/env.js`,
 * `config/database.js` and `services/emailService.js` all read their
 * configuration at module load time.
 *
 * The `override: true` is the load-bearing part. `dotenv` does NOT overwrite
 * variables already present in `process.env`, and in the development container
 * the preprod values are injected by docker-compose `env_file` before Node even
 * starts. Without the override the suite would silently keep pointing at the
 * remote Turso database — the exact bug this change exists to fix.
 */

const path = require('path');
const dotenv = require('dotenv');

// Set before loading the files so anything reading NODE_ENV during dotenv's own
// work already sees the right value.
process.env.NODE_ENV = 'test';

const apiRoot = path.resolve(__dirname, '..', '..');

// Versioned defaults (dummy values only).
dotenv.config({ path: path.join(apiRoot, '.env.test'), override: true, quiet: true });

// Optional personal overrides, gitignored. Loaded last so it wins.
dotenv.config({ path: path.join(apiRoot, '.env.test.local'), override: true, quiet: true });

// Belt and braces: NODE_ENV must be 'test' no matter what the files said.
process.env.NODE_ENV = 'test';
