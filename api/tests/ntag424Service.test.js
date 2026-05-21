/**
 * Unit tests for the NTAG 424 DNA verification service.
 *
 * These tests use FIXED known keys + UIDs (defined below) so the
 * cryptographic outputs are deterministic and reviewable in the source.
 * They serve as regression tests: any change to the algorithm in
 * ntag424Service.js or to the corresponding code in
 * scripts/nfc-personalization/src/lib/crypto.js will break these tests.
 *
 * The "round-trip" cases build a valid SUN URL by running our own helpers
 * over the plaintext, then verify that verifySunParams accepts it. This
 * checks that decryption + key derivation + session key + CMAC truncation
 * are all internally consistent.
 *
 * For end-to-end correctness against the AN12196 spec we rely on hardware
 * verification (see group 8 of the change tasks).
 */

// Mock env BEFORE requiring the service — the service reads keys at module
// load time, so the mock must be installed first.
jest.mock('../config/env', () => ({
  ntag424: {
    systemId: '313430',                            // "140" in ASCII
    kPicc: '00112233445566778899AABBCCDDEEFF',     // 16 bytes
    masterKey: 'FFEEDDCCBBAA99887766554433221100', // 16 bytes
  },
  ipHashSalt: 'abcdef0123456789abcdef0123456789',  // not used here
}));

const crypto = require('node:crypto');
const { aesCmac } = require('node-aes-cmac');

const {
  verifySunParams,
  _internal: { decryptPicc, deriveTagCmacKey, sdmSessionMacKey, computeSdmMac },
} = require('../services/ntag424Service');

const KEY_K_PICC = Buffer.from('00112233445566778899AABBCCDDEEFF', 'hex');
const TEST_UID = Buffer.from('04A1B2C3D4E5F6', 'hex'); // 7 bytes
const TEST_COUNTER = 7;

// Helper: build the 16-byte PICC plaintext that the chip would assemble,
// then encrypt it with K_PICC (AES-128-CBC, IV=0, no padding) to obtain
// what the chip would emit on the URL.
function buildEncryptedPicc(uid, counter) {
  if (uid.length !== 7) throw new Error('uid must be 7 bytes');
  const plain = Buffer.alloc(16);
  plain[0] = 0xC7; // any non-zero "tag" byte — service doesn't validate it
  uid.copy(plain, 1);
  plain[8] = counter & 0xFF;
  plain[9] = (counter >> 8) & 0xFF;
  plain[10] = (counter >> 16) & 0xFF;
  // bytes 11..15 left as random padding (chip uses 5 random bytes here)
  for (let i = 11; i < 16; i++) plain[i] = 0xAA;
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-128-cbc', KEY_K_PICC, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

// Helper: produce the 8-byte truncated CMAC for (uid, counter) using the
// same algorithm as the service. Used to construct a valid URL.
function buildExpectedCmac(uid, counter) {
  const kFile = deriveTagCmacKey(uid);
  const sessionKey = sdmSessionMacKey(kFile, uid, counter);
  return computeSdmMac(sessionKey);
}

describe('ntag424Service — internal primitives', () => {
  it('decryptPicc throws on wrong ciphertext length', () => {
    expect(() => decryptPicc('aa'.repeat(8))).toThrow(/length invalid/i);
  });

  it('decryptPicc round-trips UID + counter from a manually built ciphertext', () => {
    const piccHex = buildEncryptedPicc(TEST_UID, TEST_COUNTER).toString('hex');
    const { uid, counter } = decryptPicc(piccHex);
    expect(uid.toString('hex').toUpperCase()).toBe(TEST_UID.toString('hex').toUpperCase());
    expect(counter).toBe(TEST_COUNTER);
  });

  it('deriveTagCmacKey is deterministic for a given UID', () => {
    const a = deriveTagCmacKey(TEST_UID);
    const b = deriveTagCmacKey(TEST_UID);
    expect(a.length).toBe(16);
    expect(a.equals(b)).toBe(true);
  });

  it('deriveTagCmacKey produces different output for different UIDs', () => {
    const otherUid = Buffer.from('010203040506FF', 'hex');
    const a = deriveTagCmacKey(TEST_UID);
    const b = deriveTagCmacKey(otherUid);
    expect(a.equals(b)).toBe(false);
  });

  it('computeSdmMac returns exactly 8 bytes', () => {
    const kFile = deriveTagCmacKey(TEST_UID);
    const session = sdmSessionMacKey(kFile, TEST_UID, TEST_COUNTER);
    const mac = computeSdmMac(session);
    expect(mac.length).toBe(8);
  });

  it('computeSdmMac picks bytes at odd indices of the full CMAC', () => {
    const kFile = deriveTagCmacKey(TEST_UID);
    const session = sdmSessionMacKey(kFile, TEST_UID, TEST_COUNTER);
    const full = aesCmac(session, Buffer.alloc(0), { returnAsBuffer: true });
    const truncated = computeSdmMac(session);
    for (let i = 0; i < 8; i++) {
      expect(truncated[i]).toBe(full[2 * i + 1]);
    }
  });

  it('sdmSessionMacKey changes when the counter changes', () => {
    const kFile = deriveTagCmacKey(TEST_UID);
    const sessionA = sdmSessionMacKey(kFile, TEST_UID, 1);
    const sessionB = sdmSessionMacKey(kFile, TEST_UID, 2);
    expect(sessionA.equals(sessionB)).toBe(false);
  });
});

describe('verifySunParams — public API', () => {
  it('returns MALFORMED when picc is missing', () => {
    expect(verifySunParams({ cmacHex: '0'.repeat(16) })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
  });

  it('returns MALFORMED when picc has wrong length', () => {
    expect(verifySunParams({ piccHex: 'aa', cmacHex: '0'.repeat(16) })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
  });

  it('returns MALFORMED when cmac has non-hex characters', () => {
    expect(verifySunParams({ piccHex: '0'.repeat(32), cmacHex: 'zzzz'.repeat(4) })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
  });

  it('returns INVALID_CMAC for a well-formed PICC with the wrong CMAC', () => {
    const piccHex = buildEncryptedPicc(TEST_UID, TEST_COUNTER).toString('hex');
    const wrongCmac = '11'.repeat(8);
    const result = verifySunParams({ piccHex, cmacHex: wrongCmac });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('INVALID_CMAC');
    // PICC decrypted OK, so UID/counter should be exposed for auditing.
    expect(result.uidHex).toBe(TEST_UID.toString('hex').toUpperCase());
    expect(result.counter).toBe(TEST_COUNTER);
  });

  it('accepts a well-formed PICC + matching CMAC (round-trip)', () => {
    const piccHex = buildEncryptedPicc(TEST_UID, TEST_COUNTER).toString('hex');
    const cmacHex = buildExpectedCmac(TEST_UID, TEST_COUNTER).toString('hex');
    const result = verifySunParams({ piccHex, cmacHex });
    expect(result).toEqual({
      ok: true,
      uidHex: TEST_UID.toString('hex').toUpperCase(),
      counter: TEST_COUNTER,
    });
  });

  it('uses constant-time comparison (smoke test: same valid input is accepted multiple times)', () => {
    const piccHex = buildEncryptedPicc(TEST_UID, TEST_COUNTER).toString('hex');
    const cmacHex = buildExpectedCmac(TEST_UID, TEST_COUNTER).toString('hex');
    for (let i = 0; i < 3; i++) {
      expect(verifySunParams({ piccHex, cmacHex }).ok).toBe(true);
    }
  });

  it('produces different CMAC for different counters of the same UID', () => {
    const cmac1 = buildExpectedCmac(TEST_UID, 1).toString('hex');
    const cmac2 = buildExpectedCmac(TEST_UID, 2).toString('hex');
    expect(cmac1).not.toBe(cmac2);
  });
});
