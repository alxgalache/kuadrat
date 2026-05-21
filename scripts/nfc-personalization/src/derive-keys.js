#!/usr/bin/env node
/**
 * Diagnostic CLI: prints the five derived keys for a given UID.
 *
 * Usage:
 *   node src/derive-keys.js <UID-14-hex-chars>
 *
 * Output goes to stdout. Be careful — this prints sensitive cryptographic
 * material. Do not run on shared screens, do not pipe to files that could be
 * left lying around. Intended for one-off diagnostic sessions.
 */

import 'dotenv/config';

import { deriveAllKeys } from './lib/crypto.js';

const uidHex = process.argv[2];
if (!uidHex || !/^[0-9a-fA-F]{14}$/.test(uidHex)) {
  console.error('Usage: node src/derive-keys.js <UID-14-hex-chars>');
  process.exit(1);
}

const uid = Buffer.from(uidHex, 'hex');
const keys = deriveAllKeys(uid);

console.log(`UID = ${uidHex.toUpperCase()}`);
console.log(`K0  = ${keys.K0.toString('hex').toUpperCase()}   (App Master Key — diversified)`);
console.log(`K1  = ${keys.K1.toString('hex').toUpperCase()}   (SDMFileReadKey — diversified)`);
console.log(`K2  = ${keys.K2.toString('hex').toUpperCase()}   (K_PICC — FIXED across all stickers)`);
console.log(`K3  = ${keys.K3.toString('hex').toUpperCase()}   (unused but not zero — diversified)`);
console.log(`K4  = ${keys.K4.toString('hex').toUpperCase()}   (unused but not zero — diversified)`);
