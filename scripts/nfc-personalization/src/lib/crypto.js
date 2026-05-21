/**
 * Per-UID key derivation for NTAG 424 DNA stickers.
 *
 * Mirrors api/services/ntag424Service.js. Any change to the derivation
 * formula MUST be applied to BOTH files or programmed stickers will fail to
 * verify. Tested with the same vectors as the backend.
 *
 * Derivation follows the simplified NXP AN10922 scheme:
 *   K_tag = AES-CMAC(MASTER_KEY, label_byte || UID(7) || SYSTEM_ID(3))
 *
 * Labels assign chip-side meaning to each derived key:
 *   0x01 → K0 (App Master Key)
 *   0x02 → K1 (SDMFileReadKey — generates the per-tap CMAC)
 *   0x03 → K3 (unused but never left at zeros)
 *   0x04 → K4 (unused but never left at zeros)
 * K2 = K_PICC is FIXED across all stickers (so the server can decrypt the
 * PICC payload without knowing the UID a priori).
 */

import { aesCmac } from 'node-aes-cmac';

function hexToBuf(name, hex, expectedBytes) {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`${name} is not a valid hex string`);
  }
  if (expectedBytes !== undefined && hex.length !== expectedBytes * 2) {
    throw new Error(
      `${name} has wrong length: expected ${expectedBytes * 2} hex chars, got ${hex.length}`,
    );
  }
  return Buffer.from(hex, 'hex');
}

function getSystemId() {
  return hexToBuf('NTAG424_SYSTEM_ID', process.env.NTAG424_SYSTEM_ID, 3);
}

function getMasterKey() {
  return hexToBuf('NTAG424_MASTER_KEY', process.env.NTAG424_MASTER_KEY, 16);
}

function getKPicc() {
  return hexToBuf('NTAG424_K_PICC', process.env.NTAG424_K_PICC, 16);
}

/**
 * Derive one diversified AES-128 key for the given UID and label byte.
 *
 * @param {Buffer} uid - 7 bytes
 * @param {number} label - 0x01 | 0x02 | 0x03 | 0x04
 * @returns {Buffer} 16 bytes
 */
export function deriveTagKey(uid, label) {
  if (!Buffer.isBuffer(uid) || uid.length !== 7) {
    throw new Error('uid must be a 7-byte Buffer');
  }
  if (typeof label !== 'number' || label < 0x01 || label > 0xff) {
    throw new Error('label must be a byte (0x01..0xff)');
  }
  const divInput = Buffer.concat([Buffer.from([label]), uid, getSystemId()]);
  return aesCmac(getMasterKey(), divInput, { returnAsBuffer: true });
}

/**
 * Return the full set of five AES-128 keys to write into one sticker.
 * K2 is fixed (K_PICC), the rest are derived per-UID.
 *
 * @param {Buffer} uid - 7 bytes
 * @returns {{K0: Buffer, K1: Buffer, K2: Buffer, K3: Buffer, K4: Buffer}}
 */
export function deriveAllKeys(uid) {
  return {
    K0: deriveTagKey(uid, 0x01),
    K1: deriveTagKey(uid, 0x02),
    K2: getKPicc(),
    K3: deriveTagKey(uid, 0x03),
    K4: deriveTagKey(uid, 0x04),
  };
}

// Exported for tests / lock-tag.js
export const _internal = { getSystemId, getMasterKey, getKPicc };
