#!/usr/bin/env node
/**
 * DIAGNOSTIC HELPER — NOT for production use.
 *
 * Builds a fully valid SUN URL for a given (UID, counter) using the same
 * keys the backend will verify with. Useful for end-to-end testing the
 * /api/coa/verify endpoint WITHOUT touching a real chip.
 *
 * Usage:
 *   node src/test-build-url.js <UID-14-hex> <counter>
 *
 * Example:
 *   node src/test-build-url.js 04A1B2C3D4E5F6 0
 *
 * The output URL is what a real NTAG 424 DNA chip would emit on a tap.
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { aesCmac } from 'node-aes-cmac';

const [, , uidArg, counterArg] = process.argv;

if (!uidArg || !/^[0-9a-fA-F]{14}$/.test(uidArg)) {
  console.error('Usage: node src/test-build-url.js <UID-14-hex> <counter>');
  process.exit(1);
}
const counter = parseInt(counterArg ?? '0', 10);
if (!Number.isInteger(counter) || counter < 0 || counter > 0xFFFFFF) {
  console.error('counter must be an integer in [0, 16777215]');
  process.exit(1);
}

const baseUrl = process.env.GALLERY_BASE_URL || 'https://140d.art';
const systemId = Buffer.from(process.env.NTAG424_SYSTEM_ID, 'hex');
const kPicc = Buffer.from(process.env.NTAG424_K_PICC, 'hex');
const masterKey = Buffer.from(process.env.NTAG424_MASTER_KEY, 'hex');

const uid = Buffer.from(uidArg, 'hex');
const counterLE = Buffer.from([counter & 0xFF, (counter >> 8) & 0xFF, (counter >> 16) & 0xFF]);

// PICC plaintext: tag(1) || UID(7) || counterLE(3) || padding(5)
const piccPlain = Buffer.alloc(16);
piccPlain[0] = 0xC7;
uid.copy(piccPlain, 1);
counterLE.copy(piccPlain, 8);
// padding: 5 random-ish bytes; the backend ignores them
for (let i = 11; i < 16; i++) piccPlain[i] = 0xAA;

// PICC ciphertext = AES-128-CBC(K_PICC, IV=0, no padding)
const iv = Buffer.alloc(16, 0);
const cipher = crypto.createCipheriv('aes-128-cbc', kPicc, iv);
cipher.setAutoPadding(false);
const piccCipher = Buffer.concat([cipher.update(piccPlain), cipher.final()]);

// K1 = AES-CMAC(MASTER_KEY, 0x02 || UID || SystemID)
const k1 = aesCmac(
  masterKey,
  Buffer.concat([Buffer.from([0x02]), uid, systemId]),
  { returnAsBuffer: true },
);

// sessionKey = AES-CMAC(K1, 0x3CC30001 || 0x0080 || UID || counterLE)
const sv2 = Buffer.concat([
  Buffer.from([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]),
  uid,
  counterLE,
]);
const sessionKey = aesCmac(k1, sv2, { returnAsBuffer: true });

// CMAC truncated = bytes at odd indices of AES-CMAC(sessionKey, empty)
const fullCmac = aesCmac(sessionKey, Buffer.alloc(0), { returnAsBuffer: true });
const cmac8 = Buffer.alloc(8);
for (let i = 0; i < 8; i++) cmac8[i] = fullCmac[2 * i + 1];

const piccHex = piccCipher.toString('hex').toUpperCase();
const cmacHex = cmac8.toString('hex').toUpperCase();

console.log('UID    :', uid.toString('hex').toUpperCase());
console.log('counter:', counter);
console.log('PICC   :', piccHex);
console.log('CMAC   :', cmacHex);
console.log();
console.log(`${baseUrl}/coa?picc=${piccHex}&cmac=${cmacHex}`);
