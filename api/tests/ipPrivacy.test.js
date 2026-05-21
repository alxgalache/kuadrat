/**
 * Unit tests for the IP-hashing utility used by /api/coa/verify when
 * recording entries in verification_events.
 */

jest.mock('../config/env', () => ({
  ipHashSalt: 'sample-salt-which-is-long-enough-for-tests',
}));

const { hashIp } = require('../utils/ipPrivacy');

describe('hashIp', () => {
  it('returns null for an empty IP', () => {
    expect(hashIp('')).toBeNull();
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
  });

  it('returns a 32-character hex string', () => {
    const hash = hashIp('203.0.113.42');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces the same hash for the same IP (deterministic)', () => {
    expect(hashIp('203.0.113.42')).toBe(hashIp('203.0.113.42'));
  });

  it('produces different hashes for different IPs', () => {
    expect(hashIp('203.0.113.42')).not.toBe(hashIp('203.0.113.43'));
  });

  it('handles IPv6 addresses', () => {
    const hash = hashIp('2001:db8::1');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('hashIp — salt rotation property', () => {
  // The salt is read at module load (`config.ipHashSalt`), so to test salt
  // rotation we have to isolate the module with a different mock. jest's
  // isolateModules lets us re-require config with a fresh mock for this test.

  it('produces different hashes when the salt changes', () => {
    jest.isolateModules(() => {
      jest.doMock('../config/env', () => ({ ipHashSalt: 'salt-A' }));
      const { hashIp: hashA } = require('../utils/ipPrivacy');
      const a = hashA('203.0.113.42');

      jest.resetModules();
      jest.doMock('../config/env', () => ({ ipHashSalt: 'salt-B' }));
      const { hashIp: hashB } = require('../utils/ipPrivacy');
      const b = hashB('203.0.113.42');

      expect(a).not.toBe(b);
    });
  });
});
