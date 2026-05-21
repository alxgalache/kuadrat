/**
 * NTAG 424 DNA verification service.
 *
 * Pure cryptographic verification of SUN (Secure Unique NFC) messages emitted
 * by NTAG 424 DNA stickers configured with PICC-encrypted + CMAC mode.
 *
 * This module performs NO I/O (no DB, no logger, no fetch). All inputs come
 * from the caller, all outputs are returned. Callers are responsible for
 * logging, DB updates, and rate-limiting decisions.
 *
 * References:
 *  - NXP AN12196 — NTAG 424 DNA Features and Hints (PICC encryption, SDM, CMAC)
 *  - NXP AN10922 — Symmetric key diversification (per-UID K1 derivation)
 */

const crypto = require('node:crypto');
const { aesCmac } = require('node-aes-cmac');
const config = require('../config/env');

const K_PICC = Buffer.from(config.ntag424.kPicc, 'hex');
const MASTER_KEY = Buffer.from(config.ntag424.masterKey, 'hex');
const SYSTEM_ID = Buffer.from(config.ntag424.systemId, 'hex');

const PICC_LABEL_K1 = 0x02;
const PICC_CIPHERTEXT_BYTES = 16;
const CMAC_BYTES = 8;
const UID_BYTES = 7;
const COUNTER_BYTES = 3;

const PICC_HEX_LENGTH = PICC_CIPHERTEXT_BYTES * 2;
const CMAC_HEX_LENGTH = CMAC_BYTES * 2;

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Decrypt the 16-byte PICC ciphertext mirrored in the SUN URL.
 * AES-128-CBC with K_PICC, IV = 16 zero bytes, no padding.
 *
 * The 16-byte plaintext layout is:
 *   [tagByte(1) | UID(7) | counterLE(3) | padding(5)]
 *
 * @param {string} piccHex - 32 hex chars (16 bytes ciphertext)
 * @returns {{ piccDataTag: number, uid: Buffer, counter: number }}
 * @throws {Error} when piccHex length is invalid
 */
function decryptPicc(piccHex) {
  const ciphertext = Buffer.from(piccHex, 'hex');
  if (ciphertext.length !== PICC_CIPHERTEXT_BYTES) {
    throw new Error('PICC ciphertext length invalid');
  }
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-128-cbc', K_PICC, iv);
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const piccDataTag = plain[0];
  const uid = plain.subarray(1, 1 + UID_BYTES);
  const ctrLE = plain.subarray(1 + UID_BYTES, 1 + UID_BYTES + COUNTER_BYTES);
  const counter = ctrLE[0] | (ctrLE[1] << 8) | (ctrLE[2] << 16);

  return { piccDataTag, uid, counter };
}

/**
 * Derive the per-UID SDMFileReadKey (K1) from the master key.
 * Follows the simplified NXP AN10922 scheme: AES-CMAC over label || UID || SystemID.
 *
 * @param {Buffer} uid - 7 bytes UID
 * @returns {Buffer} 16 bytes AES-128 key
 */
function deriveTagCmacKey(uid) {
  const divInput = Buffer.concat([Buffer.from([PICC_LABEL_K1]), uid, SYSTEM_ID]);
  return aesCmac(MASTER_KEY, divInput, { returnAsBuffer: true });
}

/**
 * Derive the per-tap session MAC key from K1 + UID + counter.
 * Following AN12196 SDM session derivation:
 *   SV2 = 0x3C C3 00 01 00 80 || UID(7) || counterLE(3)   = 16 bytes
 *   sessionKey = AES-CMAC(K1, SV2)
 *
 * @param {Buffer} kFile - per-UID K1 (16 bytes)
 * @param {Buffer} uid - 7 bytes UID
 * @param {number} counter - SDMReadCtr value
 * @returns {Buffer} 16 bytes session key
 */
function sdmSessionMacKey(kFile, uid, counter) {
  const ctrLE = Buffer.from([
    counter & 0xFF,
    (counter >> 8) & 0xFF,
    (counter >> 16) & 0xFF,
  ]);
  const sv2 = Buffer.concat([
    Buffer.from([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]),
    uid,
    ctrLE,
  ]);
  return aesCmac(kFile, sv2, { returnAsBuffer: true });
}

/**
 * Compute the truncated CMAC mirrored in the SUN URL.
 * Full CMAC is AES-CMAC(sessionKey, macInput). The chip emits only the 8 bytes
 * at odd indices (1, 3, 5, 7, 9, 11, 13, 15) of the full 16-byte result.
 *
 * In our config the SDM MAC input offset equals the MAC offset, so macInput
 * is empty — protection comes from the per-tap session key derivation.
 *
 * @param {Buffer} sessionKey - 16 bytes from sdmSessionMacKey
 * @param {Buffer} [macInput=empty] - bytes to MAC; defaults to empty buffer
 * @returns {Buffer} 8 bytes truncated CMAC
 */
function computeSdmMac(sessionKey, macInput) {
  const input = macInput || Buffer.alloc(0);
  const full = aesCmac(sessionKey, input, { returnAsBuffer: true });
  const out = Buffer.alloc(CMAC_BYTES);
  for (let i = 0; i < CMAC_BYTES; i++) {
    out[i] = full[2 * i + 1];
  }
  return out;
}

/**
 * Verify a SUN URL's PICC + CMAC pair.
 *
 * Returns:
 *   { ok: true,  uidHex, counter }                              on success
 *   { ok: false, reason: 'MALFORMED' }                          on bad input format
 *                                                                or bad PICC ciphertext
 *   { ok: false, reason: 'INVALID_CMAC', uidHex, counter }      on signature mismatch
 *
 * @param {{piccHex?: string, cmacHex?: string}} params
 * @returns {{ok: boolean, reason?: string, uidHex?: string, counter?: number}}
 */
function verifySunParams({ piccHex, cmacHex } = {}) {
  if (typeof piccHex !== 'string' || piccHex.length !== PICC_HEX_LENGTH || !HEX_RE.test(piccHex)) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (typeof cmacHex !== 'string' || cmacHex.length !== CMAC_HEX_LENGTH || !HEX_RE.test(cmacHex)) {
    return { ok: false, reason: 'MALFORMED' };
  }

  let uid;
  let counter;
  try {
    ({ uid, counter } = decryptPicc(piccHex));
  } catch (_err) {
    return { ok: false, reason: 'MALFORMED' };
  }
  const uidHex = uid.toString('hex').toUpperCase();

  const kFile = deriveTagCmacKey(uid);
  const sessionKey = sdmSessionMacKey(kFile, uid, counter);
  const expected = computeSdmMac(sessionKey);
  const provided = Buffer.from(cmacHex, 'hex');

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'INVALID_CMAC', uidHex, counter };
  }

  return { ok: true, uidHex, counter };
}

module.exports = {
  verifySunParams,
  // Exported for unit tests / diagnostics; not intended for production callers.
  _internal: {
    decryptPicc,
    deriveTagCmacKey,
    sdmSessionMacKey,
    computeSdmMac,
  },
};
