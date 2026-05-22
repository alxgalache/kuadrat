/**
 * Thin domain layer over the `ntag424` library.
 *
 * The library handles all the heavy lifting of the AN12196 protocol
 * (AuthenticateEV2First, ChangeKey, ChangeFileSettings, etc.). This module
 * concentrates the *project-specific* pieces:
 *  - building the exact NDEF payload our SDM offsets reference
 *  - building the FileSettings object for personalization-time vs lock-time
 *  - constants (factory key, application ID, key labels)
 *
 * Keeping these in one place means personalize.js, lock-tag.js and
 * inspect-tag.js all agree on byte layouts.
 */

import { createTagSession, isoSelectFileMode } from 'ntag424';

// Re-export the bits of the library scripts need so callers don't import
// from two places.
export { createTagSession, isoSelectFileMode };

// Standard NTAG 424 DNA application ID. Selected before any file-level
// command. Same value used in the library's own example.
export const NTAG424_NDEF_AID = Buffer.from('d2760000850101', 'hex');

// File ID of the NDEF Standard Data File (where the SUN URL lives).
export const FILE_NDEF = 0x02;

// All five keys of a fresh chip default to sixteen zero bytes.
export const FACTORY_KEY = Buffer.alloc(16, 0);

// NDEF layout — keep in lockstep with PICC_OFFSET / CMAC_OFFSET below.
//
//   offset 0-1   NLEN (NDEF message length, big-endian)
//   offset 2     0xD1 (NDEF header: MB|ME|SR, TNF=WellKnown)
//   offset 3     0x01 (Type Length)
//   offset 4     0x49 (Payload Length = 73 bytes)
//   offset 5     0x55 ('U' — URI record type)
//   offset 6     0x04 (URI prefix code for "https://")
//   offset 7-24  18 chars  → "<host>/coa?picc="
//   offset 25-56 32 chars  → 32 ASCII zeros (PICC placeholder, chip rewrites at tap)
//   offset 57-62 6 chars   → "&cmac="
//   offset 63-78 16 chars  → 16 ASCII zeros (CMAC placeholder)
//
// Total NDEF payload (everything starting at the 0xD1 header) = 77 bytes.
// NLEN therefore = 0x004D.

export const PICC_OFFSET_IN_FILE = 25;
export const MAC_INPUT_OFFSET_IN_FILE = 63;
export const MAC_OFFSET_IN_FILE = 63;

const PICC_PLACEHOLDER_LENGTH = 32;
const CMAC_PLACEHOLDER_LENGTH = 16;

/**
 * Build the NDEF buffer to write into File 02.
 *
 * The buffer is what we send via `session.writeData(...)` starting at offset
 * 0 of File 02. The chip rewrites bytes 25..56 and 63..78 at every tap to
 * inject the encrypted PICC and the truncated CMAC.
 *
 * @param {string} baseUrl  e.g. "https://140d.art"
 * @returns {Buffer}        79-byte buffer (NLEN + NDEF record)
 */
export function buildNdefBuffer(baseUrl) {
  // Strip trailing slash, then strip the scheme: the URI prefix byte 0x04
  // already encodes "https://".
  const cleanBase = baseUrl.replace(/\/+$/, '');
  if (!cleanBase.startsWith('https://')) {
    throw new Error(`GALLERY_BASE_URL must use https:// (got: ${baseUrl})`);
  }
  const hostPath = cleanBase.slice('https://'.length); // e.g. "140d.art"
  const prefix = `${hostPath}/coa?picc=`;
  const suffix = '&cmac=';
  const piccPlaceholder = '0'.repeat(PICC_PLACEHOLDER_LENGTH);
  const cmacPlaceholder = '0'.repeat(CMAC_PLACEHOLDER_LENGTH);

  // Sanity-check that the placeholder offsets land where the SDM config
  // says. Off-by-one here would silently break verification.
  const ndefRecordHeaderLength = 4; // 0xD1, TL, PL, Type
  const uriPrefixByteLength = 1;
  const piccStart = 2 + ndefRecordHeaderLength + uriPrefixByteLength + prefix.length;
  if (piccStart !== PICC_OFFSET_IN_FILE) {
    throw new Error(
      `Internal: PICC placeholder would land at offset ${piccStart}, expected ${PICC_OFFSET_IN_FILE}. ` +
      `Check GALLERY_BASE_URL hostname length.`,
    );
  }
  const cmacStart = piccStart + PICC_PLACEHOLDER_LENGTH + suffix.length;
  if (cmacStart !== MAC_OFFSET_IN_FILE) {
    throw new Error(
      `Internal: CMAC placeholder would land at offset ${cmacStart}, expected ${MAC_OFFSET_IN_FILE}.`,
    );
  }

  const uriBody = `${prefix}${piccPlaceholder}${suffix}${cmacPlaceholder}`;
  const payload = Buffer.concat([
    Buffer.from([0x04]),          // URI prefix: "https://"
    Buffer.from(uriBody, 'ascii'),
  ]);
  const payloadLength = payload.length;

  const ndefRecord = Buffer.concat([
    Buffer.from([0xD1, 0x01, payloadLength, 0x55]),
    payload,
  ]);
  const nlen = Buffer.from([(ndefRecord.length >> 8) & 0xFF, ndefRecord.length & 0xFF]);

  return Buffer.concat([nlen, ndefRecord]);
}

/**
 * FileSettings object for the personalization stage:
 *  - Read free (so a tap from any phone resolves to the SUN URL).
 *  - Write/ReadWrite/Change locked behind K0 (so only the operator can
 *    update before final lock).
 *  - SDM enabled with encrypted PICC mirror + CMAC mirror.
 *
 * IMPORTANT — uidOffset and readCounterOffset are set to 0 (non-null).
 * The library uses them only to set bits 7+6 of the SDMOptions byte,
 * which tells the chip that UID and counter ARE included in the encrypted
 * PICC payload. The values themselves are NOT written to the APDU when
 * metaRead is a key number (encrypted PICC path). Setting them to null
 * leaves bits 7+6 unset → chip rejects piccDataOffset → error 919e.
 *
 * The shape matches the library's `FileSettings` type
 * (src/serializer/fileSettings.ts).
 */
export const SDM_FILE_SETTINGS_OPEN = {
  commMode: 'plain',
  access: {
    read: 0xe,        // free
    write: 0,         // K0
    readWrite: 0,     // K0
    change: 0,        // K0
  },
  sdmOptions: {
    uidOffset: 0,           // non-null → sets bit 7 (UID in PICC payload)
    readCounterOffset: 0,   // non-null → sets bit 6 (counter in PICC payload)
    piccDataOffset: PICC_OFFSET_IN_FILE,
    macInputOffset: MAC_INPUT_OFFSET_IN_FILE,
    macOffset: MAC_OFFSET_IN_FILE,
    encryptedFileData: null,
    readCounterLimit: null,
    encodingMode: 'ascii',
    accessRights: {
      metaRead: 2,            // K2 (K_PICC, fixed) — decrypts PICC
      fileRead: 1,            // K1 (per-UID)        — generates CMAC
      counterRetrieval: 0xf,  // disabled
    },
  },
};

/**
 * FileSettings for the irreversible lock step. Read stays free (tap keeps
 * working forever), everything else is set to 0xf (no access for any key).
 * Once written, no future ChangeFileSettings or WriteData on File 02 can
 * succeed.
 */
export const SDM_FILE_SETTINGS_LOCKED = {
  ...SDM_FILE_SETTINGS_OPEN,
  access: {
    read: 0xe,
    write: 0xf,
    readWrite: 0xf,
    change: 0xf,
  },
};

/**
 * `tagParams` required by setFileSettings for length validation. These are
 * fixed properties of the NTAG 424 DNA chip + our SDM config.
 */
export const NTAG_TAG_PARAMS = {
  fileSize: 256,               // File 02 capacity on the NTAG 424 DNA
  encodedUidLength: 14,        // we don't mirror UID, but the lib expects this
  encodedReadCounterLength: 6, // ditto for the counter
  piccDataLength: PICC_PLACEHOLDER_LENGTH, // 32 hex chars
};
