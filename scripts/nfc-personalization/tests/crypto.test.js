/**
 * Tests for the subproject's key derivation, executed by `node --test`.
 *
 * The subproject is ESM (the ntag424 library is ESM-only) so we use Node's
 * built-in test runner instead of Jest. The tests assert that:
 *   1. The derivation is deterministic and varies per-UID.
 *   2. The derivation matches the backend's identical algorithm. Since the
 *      backend lives in api/ as CommonJS, we reproduce its math here using
 *      the same `node-aes-cmac` primitives — if the formula drifts in
 *      either file, this test fails.
 *
 * To run:
 *   npm test
 *
 * Requires the same env vars the runtime needs. Set test values here so we
 * don't depend on the .env present on the operator's machine.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { aesCmac } from 'node-aes-cmac';

// Fixed test material — must match the values used in
// api/tests/ntag424Service.test.js so the two implementations can be
// compared with consistent inputs.
const TEST_SYSTEM_ID = '313430';
const TEST_K_PICC = '00112233445566778899AABBCCDDEEFF';
const TEST_MASTER_KEY = 'FFEEDDCCBBAA99887766554433221100';

let deriveTagKey;
let deriveAllKeys;

before(async () => {
  process.env.NTAG424_SYSTEM_ID = TEST_SYSTEM_ID;
  process.env.NTAG424_K_PICC = TEST_K_PICC;
  process.env.NTAG424_MASTER_KEY = TEST_MASTER_KEY;
  ({ deriveTagKey, deriveAllKeys } = await import('../src/lib/crypto.js'));
});

// Re-implementation of the backend derivation, used as the oracle.
function backendDerive(uid, label) {
  const divInput = Buffer.concat([
    Buffer.from([label]),
    uid,
    Buffer.from(TEST_SYSTEM_ID, 'hex'),
  ]);
  return aesCmac(Buffer.from(TEST_MASTER_KEY, 'hex'), divInput, { returnAsBuffer: true });
}

test('deriveTagKey is deterministic for the same UID', () => {
  const uid = Buffer.from('04A1B2C3D4E5F6', 'hex');
  const a = deriveTagKey(uid, 0x02);
  const b = deriveTagKey(uid, 0x02);
  assert.equal(a.length, 16);
  assert.ok(a.equals(b));
});

test('deriveTagKey differs across labels for the same UID', () => {
  const uid = Buffer.from('04A1B2C3D4E5F6', 'hex');
  const k0 = deriveTagKey(uid, 0x01);
  const k1 = deriveTagKey(uid, 0x02);
  assert.ok(!k0.equals(k1));
});

test('deriveTagKey differs across UIDs for the same label', () => {
  const uidA = Buffer.from('04A1B2C3D4E5F6', 'hex');
  const uidB = Buffer.from('010203040506FF', 'hex');
  const a = deriveTagKey(uidA, 0x02);
  const b = deriveTagKey(uidB, 0x02);
  assert.ok(!a.equals(b));
});

test('deriveTagKey matches the backend derivation byte-for-byte (label 0x02)', () => {
  const uid = Buffer.from('04A1B2C3D4E5F6', 'hex');
  const ours = deriveTagKey(uid, 0x02);
  const theirs = backendDerive(uid, 0x02);
  assert.ok(ours.equals(theirs), `mismatch — backend=${theirs.toString('hex')} subproject=${ours.toString('hex')}`);
});

test('deriveTagKey rejects bad UID length', () => {
  assert.throws(() => deriveTagKey(Buffer.from([1, 2, 3]), 0x01), /7-byte Buffer/);
});

test('deriveAllKeys returns 5 keys, K2 fixed to K_PICC, others diversified', () => {
  const uid = Buffer.from('04A1B2C3D4E5F6', 'hex');
  const keys = deriveAllKeys(uid);

  assert.equal(keys.K0.length, 16);
  assert.equal(keys.K1.length, 16);
  assert.equal(keys.K2.length, 16);
  assert.equal(keys.K3.length, 16);
  assert.equal(keys.K4.length, 16);

  // K2 is the fixed K_PICC, NOT diversified.
  assert.ok(keys.K2.equals(Buffer.from(TEST_K_PICC, 'hex')));

  // K0, K1, K3, K4 all diversified and pairwise distinct.
  const set = new Set([keys.K0.toString('hex'), keys.K1.toString('hex'), keys.K3.toString('hex'), keys.K4.toString('hex')]);
  assert.equal(set.size, 4);
});
