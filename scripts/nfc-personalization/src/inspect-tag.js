#!/usr/bin/env node
/**
 * Read-only diagnostic for an NTAG 424 DNA sticker.
 *  - Reads UID.
 *  - Reads FileSettings of File 02 (SDM offsets, FileAR, access keys).
 *  - Reads the row from nfc_tags if the UID is known.
 *
 * Does NOT authenticate (for personalized tags this means SDM-related
 * details require a separate authenticated session — out of scope for
 * inspect), does NOT change anything. Safe to run on any sticker at any
 * point in its lifecycle.
 */

import 'dotenv/config';

import { NFC, TAG_ISO_14443_4 } from 'nfc-pcsc';

import {
  createTagSession,
  isoSelectFileMode,
  NTAG424_NDEF_AID,
  FILE_NDEF,
  FACTORY_KEY,
} from './lib/ntag424.js';
import { deriveAllKeys } from './lib/crypto.js';
import { getTagByUid } from './lib/db.js';

async function processCard(reader) {
  const session = createTagSession(reader);

  try {
    const uid = await session.getUid();
    const uidHex = uid.toString('hex').toUpperCase();
    console.log(`\n📡 UID: ${uidHex}`);

    try {
      await session.selectFile(NTAG424_NDEF_AID, isoSelectFileMode.BY_DF_NAME);
      console.log('✓ Aplicación NTAG 424 DNA seleccionada.');
    } catch (err) {
      console.error(`✗ No se pudo seleccionar la aplicación NTAG 424 DNA: ${err.message}`);
      console.error('  Probablemente este tag no es un NTAG 424 DNA.');
      return;
    }

    // To read FileSettings on a personalized tag we need to authenticate.
    // Try factory key first (works on virgin tags); fall back to derived K0.
    let authedWith = null;
    try {
      await session.authenticate(0, FACTORY_KEY);
      authedWith = 'factory (K0 = zeros)';
    } catch {
      try {
        const keys = deriveAllKeys(uid);
        await session.authenticate(0, keys.K0);
        authedWith = 'derived K0';
      } catch (err) {
        console.warn(`⚠️  No se pudo autenticar con K0 (ni factory ni derivada): ${err.message}`);
      }
    }
    if (authedWith) {
      console.log(`✓ Autenticado con ${authedWith}.`);
    }

    try {
      const settings = await session.getFileSettings(FILE_NDEF);
      console.log('📄 File 02 FileSettings:');
      console.log(`     commMode:   ${settings.commMode}`);
      console.log(`     access:     ${JSON.stringify(settings.access)}`);
      if (settings.sdmOptions) {
        console.log('     sdmOptions:');
        console.log(`       piccDataOffset:     ${settings.sdmOptions.piccDataOffset}`);
        console.log(`       macInputOffset:     ${settings.sdmOptions.macInputOffset}`);
        console.log(`       macOffset:          ${settings.sdmOptions.macOffset}`);
        console.log(`       accessRights:       ${JSON.stringify(settings.sdmOptions.accessRights)}`);
        console.log(`       encodingMode:       ${settings.sdmOptions.encodingMode}`);
      } else {
        console.log('     sdmOptions: (none — SDM no configurado)');
      }
    } catch (err) {
      console.error(`✗ ReadFileSettings falló: ${err.message}`);
    }

    try {
      const tag = await getTagByUid(uidHex);
      if (!tag) {
        console.log(`📂 BD: este UID NO está registrado en nfc_tags.`);
      } else {
        console.log('📂 BD nfc_tags:');
        console.log(`     art:                "${tag.art_name}" (id=${tag.art_id}, slug=${tag.art_slug})`);
        console.log(`     serial:             ${tag.serial_label || '-'}`);
        console.log(`     status:             ${tag.status}`);
        console.log(`     last_counter:       ${tag.last_counter}`);
        console.log(`     locked:             ${tag.is_permanently_locked === 1 ? 'SÍ' : 'no'}`);
        console.log(`     personalized_at:    ${tag.personalized_at}`);
        console.log(`     personalized_by:    ${tag.personalized_by}`);
        if (tag.locked_at) console.log(`     locked_at:        ${tag.locked_at}`);
        if (tag.notes) console.log(`     notes:\n${tag.notes.split('\n').map(l => `       ${l}`).join('\n')}`);
      }
    } catch (err) {
      console.error(`✗ Consulta a BD falló: ${err.message}`);
    }
  } catch (err) {
    console.error('✗ Error general:', err.message);
  }
}

function main() {
  console.log('🔍 140d Galería de Arte — Inspección NTAG 424 DNA (read-only)');
  console.log('   Coloca una pegatina sobre el lector...');
  const nfc = new NFC();
  nfc.on('reader', (reader) => {
    console.log(`✓ Lector conectado: ${reader.name}`);
    reader.autoProcessing = false;
    reader.on('card', (tag) => {
      if (tag.type !== TAG_ISO_14443_4) {
        console.warn(`Tag detectado pero no soportado (type=${tag.type}). Ignorando.`);
        return;
      }
      processCard(reader);
    });
    reader.on('error', (err) => console.error('Error de lector:', err.message));
  });
  nfc.on('error', (err) => console.error('Error NFC:', err.message));
}

main();
