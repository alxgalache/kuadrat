/**
 * Sentry environment gating (openspec change sentry-noise-cleanup).
 *
 * Two independent gates, which must never be collapsed into one:
 *
 *   NODE_ENV=test        -> Sentry is never imported at all. Structural: the
 *                           global require-hook instrumentation survives Jest's
 *                           per-file module registry and breaks unrelated
 *                           suites. `enabled: false` would NOT be enough,
 *                           because init() still installs the versioned global
 *                           carrier.
 *   NODE_ENV=development -> imported and initialized, transport muted. Keeps
 *                           the wiring identical across environments while the
 *                           HMR/nodemon noise stops leaving the machine.
 *                           SENTRY_ENABLE_DEV=true opts back in.
 *
 * The criterion lives in TWO places on purpose — config/env.js (for the app to
 * read) and instrument.js (the authority, which cannot require config/env.js
 * because it must run before anything else patches `require`). This file is
 * what stops those two from drifting apart.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const API_ROOT = path.resolve(__dirname, '..');

// The environment matrix, shared by both halves of this file.
const MATRIX = [
  { name: 'test', env: { NODE_ENV: 'test' }, expected: false },
  { name: 'development', env: { NODE_ENV: 'development' }, expected: false },
  {
    name: 'development with SENTRY_ENABLE_DEV=true',
    env: { NODE_ENV: 'development', SENTRY_ENABLE_DEV: 'true' },
    expected: true,
  },
  {
    name: 'development with SENTRY_ENABLE_DEV=1 (not the literal "true")',
    env: { NODE_ENV: 'development', SENTRY_ENABLE_DEV: '1' },
    expected: false,
  },
  { name: 'unset NODE_ENV (counts as development)', env: {}, expected: false },
  { name: 'staging', env: { NODE_ENV: 'staging' }, expected: true },
  { name: 'production', env: { NODE_ENV: 'production' }, expected: true },
  {
    name: 'test with SENTRY_ENABLE_DEV=true (escape hatch must not apply)',
    env: { NODE_ENV: 'test', SENTRY_ENABLE_DEV: 'true' },
    expected: false,
  },
];

// Reloads config/env.js under a given environment and returns config.sentry.enabled.
// process.env is restored by the caller.
function configEnabledUnder(env) {
  jest.resetModules();
  delete process.env.SENTRY_ENABLE_DEV;
  delete process.env.NODE_ENV;
  Object.assign(process.env, env);
  return require('../config/env').sentry.enabled;
}

// Boots instrument.js in a SEPARATE Node process and reports whether the Sentry
// client ended up enabled. A separate process is mandatory: requiring
// instrument.js inside a Jest worker is the exact thing the test gate exists to
// prevent. `null` means no client was created at all (the test path).
function instrumentEnabledUnder(env) {
  const childEnv = { ...process.env };
  delete childEnv.NODE_ENV;
  delete childEnv.SENTRY_ENABLE_DEV;
  Object.assign(childEnv, env);

  const script = `
    const Sentry = require(${JSON.stringify(path.join(API_ROOT, 'instrument.js'))});
    const client = Sentry.getClient();
    process.stdout.write('RESULT:' + JSON.stringify(
      client ? client.getOptions().enabled : null
    ));
  `;

  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: API_ROOT,
    env: childEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const match = out.match(/RESULT:(.*)$/);
  if (!match) throw new Error(`instrument.js probe produced no result:\n${out}`);
  return JSON.parse(match[1]);
}

describe('Sentry environment gating', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  describe('config.sentry.enabled', () => {
    it.each(MATRIX)('is $expected under $name', ({ env, expected }) => {
      expect(configEnabledUnder(env)).toBe(expected);
    });
  });

  describe('instrument.js (the authority)', () => {
    // Slower than the config half: each case boots a child Node process.
    jest.setTimeout(60000);

    it('never creates a Sentry client under NODE_ENV=test', () => {
      expect(instrumentEnabledUnder({ NODE_ENV: 'test' })).toBeNull();
      expect(
        instrumentEnabledUnder({ NODE_ENV: 'test', SENTRY_ENABLE_DEV: 'true' })
      ).toBeNull();
    });

    it('creates a client with the transport muted in development', () => {
      expect(instrumentEnabledUnder({ NODE_ENV: 'development' })).toBe(false);
    });

    it('creates an enabled client in development when the escape hatch is set', () => {
      expect(
        instrumentEnabledUnder({ NODE_ENV: 'development', SENTRY_ENABLE_DEV: 'true' })
      ).toBe(true);
    });

    it('creates an enabled client in staging and production', () => {
      expect(instrumentEnabledUnder({ NODE_ENV: 'staging' })).toBe(true);
      expect(instrumentEnabledUnder({ NODE_ENV: 'production' })).toBe(true);
    });
  });

  describe('the two criteria agree', () => {
    jest.setTimeout(120000);

    // The whole point of this file. config/env.js mirrors a criterion it cannot
    // import; if someone edits one side only, this fails.
    it.each(MATRIX)('agree under $name', ({ env, expected }) => {
      const fromConfig = configEnabledUnder(env);
      const fromInstrument = instrumentEnabledUnder(env);

      expect(fromConfig).toBe(expected);
      // Under test instrument.js reports null (no client) rather than false —
      // a stronger guarantee than "disabled", and the reason the two gates are
      // not the same mechanism.
      expect(fromInstrument === null ? false : fromInstrument).toBe(fromConfig);
    });
  });
});
