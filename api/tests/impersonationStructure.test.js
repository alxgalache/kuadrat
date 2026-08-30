/**
 * Structural guards for admin impersonation (admin-user-impersonation).
 *
 * Same role as editionInventory.test.js and sendcloudAuth.test.js: these
 * assertions are not about behaviour a request can exercise, they are about
 * properties of the source that a future edit could break silently and that no
 * functional test would notice.
 */

const fs = require('fs');
const path = require('path');

const API_ROOT = path.join(__dirname, '..');

const readFile = (relative) => fs.readFileSync(path.join(API_ROOT, relative), 'utf8');

/**
 * Source with comments removed.
 *
 * Every assertion below is about what the code DOES, and the comments in these
 * files explain precisely the things the assertions forbid — the note in
 * authRoutes.js saying why the route is not behind `adminAuth`, the one in the
 * controller saying the TTL is deliberately not `JWT_EXPIRES_IN`. Grepping the
 * raw text would make those explanations fail the very test they document.
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const readCode = (relative) => stripComments(readFile(relative));

/** Every .js file under the given directories, recursively. */
const jsFilesUnder = (...dirs) => {
  const found = [];

  const walk = (absolute, relative) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const childAbs = path.join(absolute, entry.name);
      const childRel = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.name.endsWith('.js')) found.push(childRel);
    }
  };

  for (const dir of dirs) walk(path.join(API_ROOT, dir), dir);
  return found;
};

describe('blockWhileImpersonating is applied to exactly one route', () => {
  it('appears only on PUT /profile/password in sellerRoutes.js', () => {
    const applications = [];

    for (const file of jsFilesUnder('routes', 'controllers', 'services')) {
      const source = readFile(file);
      source.split('\n').forEach((line, index) => {
        // Only count route registrations, not the import line.
        if (/router\.(get|post|put|patch|delete)\(/.test(line) && line.includes('blockWhileImpersonating')) {
          applications.push({ file, line: index + 1, text: line.trim() });
        }
      });
    }

    // Widening this guard is a security decision, not a refactor: every route
    // it covers is one an admin cannot perform on an artist's behalf, and the
    // whole premise of the feature is that the list stays justified. Adding a
    // route here means updating the spec and this assertion together.
    expect(applications).toHaveLength(1);
    expect(applications[0].file).toBe(path.join('routes', 'sellerRoutes.js'));
    expect(applications[0].text).toContain("'/profile/password'");
  });

  it('is exported from the shared authorization middleware', () => {
    const { blockWhileImpersonating } = require('../middleware/authorization');
    expect(typeof blockWhileImpersonating).toBe('function');
  });
});

describe('no impersonation token ever reaches a log sink', () => {
  it('does not log the minted token in the impersonation controller', () => {
    const source = readCode(path.join('controllers', 'impersonationController.js'));

    // Every logger call in the file, including multi-line ones.
    const loggerCalls = source.match(/logger\.\w+\([\s\S]*?\);/g) || [];
    expect(loggerCalls.length).toBeGreaterThan(0);

    for (const call of loggerCalls) {
      expect(call).not.toMatch(/\btoken\b/);
      expect(call).not.toMatch(/password/i);
    }
  });

  it('does not put the token in the response of any other route', () => {
    // The token is minted in exactly two places, both in the controller.
    for (const file of jsFilesUnder('routes', 'controllers', 'services')) {
      if (file.endsWith('impersonationController.js')) continue;
      // \b keeps this off `contact:`, which is a legitimate payload key.
      expect(readCode(file)).not.toMatch(/\bact:/);
    }
  });
});

describe('the impersonation TTL is decoupled from the login lifetime', () => {
  it('does not read JWT_EXPIRES_IN when minting an impersonation token', () => {
    const source = readCode(path.join('controllers', 'impersonationController.js'));

    // An impersonation is an intervention, not a session. Inheriting
    // JWT_EXPIRES_IN (7 days) would quietly turn it into a second account.
    const [beforeStop] = source.split('const stopImpersonation');
    expect(beforeStop).not.toContain('JWT_EXPIRES_IN');
    expect(beforeStop).toContain('IMPERSONATION_TTL_MINUTES');

    // The stop endpoint, restoring an ordinary admin session, does use it.
    expect(source).toContain('JWT_EXPIRES_IN');
  });

  it('keeps the TTL at 60 minutes', () => {
    const { IMPERSONATION_TTL_MINUTES } = require('../controllers/impersonationController');
    expect(IMPERSONATION_TTL_MINUTES).toBe(60);
  });
});

describe('the stop endpoint is not behind adminAuth', () => {
  it('is declared on the public auth router with authenticate only', () => {
    const authRoutes = readCode(path.join('routes', 'authRoutes.js'));
    expect(authRoutes).toContain("router.post('/impersonation/stop'");
    expect(authRoutes).not.toContain('adminAuth');

    // And the start half is under the admin router, which applies both.
    const adminIndex = readCode(path.join('routes', 'admin', 'index.js'));
    expect(adminIndex).toContain("router.use('/impersonation'");
    expect(adminIndex).toContain('authenticate, adminAuth');
  });
});
