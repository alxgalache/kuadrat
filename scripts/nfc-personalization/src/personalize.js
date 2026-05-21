#!/usr/bin/env node
/**
 * Personalize one NTAG 424 DNA sticker:
 *  - read UID
 *  - ask operator which artwork (slug) to bind it to
 *  - derive five per-UID keys
 *  - replace factory K0 with diversified K0, K1, K2, K3, K4
 *  - write NDEF URL template with PICC + CMAC placeholders
 *  - configure SDM mirroring on File 02
 *  - insert one row in nfc_tags
 *
 * The permanent lock is NOT applied here. After this script finishes, the
 * operator must verify the tap works from a phone and only then run
 * `npm run lock -- <UID>`.
 */

import 'dotenv/config';

import { NFC, TAG_ISO_14443_4 } from 'nfc-pcsc';
import prompts from 'prompts';

import {
  createTagSession,
  isoSelectFileMode,
  NTAG424_NDEF_AID,
  FILE_NDEF,
  FACTORY_KEY,
  buildNdefBuffer,
  SDM_FILE_SETTINGS_OPEN,
  NTAG_TAG_PARAMS,
} from './lib/ntag424.js';
import { deriveAllKeys } from './lib/crypto.js';
import {
  findArtBySlug,
  findActiveTagByArt,
  insertNfcTag,
  markAsDamaged,
} from './lib/db.js';

const BASE_URL = process.env.GALLERY_BASE_URL || 'https://140d.art';
const OPERATOR = process.env.OPERATOR || 'unknown';
const NEW_KEY_VERSION = 1; // every fresh sticker starts at K0..K4 version 1

const NDEF_BUFFER = buildNdefBuffer(BASE_URL);

function bannerStart() {
  console.log('🎨 140d Galería de Arte — Personalización NTAG 424 DNA');
  console.log(`   Operador: ${OPERATOR}`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log('   Coloca una pegatina sobre el lector ACR1552U para empezar.\n');
}

function bannerDone(uidHex, art) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PRÓXIMOS PASOS PARA ESTA PEGATINA:');
  console.log('  1. Retira la pegatina del lector.');
  console.log('  2. Pásala por tu móvil. Debe abrirse:');
  console.log(`     ${BASE_URL}/coa?picc=<32hex>&cmac=<16hex>`);
  console.log('     con valores DISTINTOS en cada lectura.');
  console.log(`  3. Verifica que la página muestra: "${art.name}".`);
  console.log('  4. Si todo correcto, pega la pegatina al CoA físico y archiva.');
  console.log('  5. Tras 1-7 días de verificación con uso real:');
  console.log(`     npm run lock -- ${uidHex}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Coloca la siguiente pegatina o pulsa Ctrl+C para salir.\n');
}

async function processCard(reader) {
  const session = createTagSession(reader);
  let uidHex = null;
  let registeredInDb = false;

  try {
    const uid = await session.getUid();
    uidHex = uid.toString('hex').toUpperCase();
    console.log(`📡 Tag detectado — UID: ${uidHex}`);

    const { slug } = await prompts({
      type: 'text',
      name: 'slug',
      message: 'Slug de la obra a vincular (campo "slug" en tabla art):',
    });
    if (!slug) {
      console.log('Cancelado.');
      return;
    }

    const art = await findArtBySlug(slug);
    if (!art) {
      console.error(`✗ No existe obra con slug "${slug}" en la tabla art.`);
      return;
    }
    if (art.removed) {
      console.error(`✗ La obra "${art.name}" está marcada como removed=1.`);
      return;
    }
    if (art.status !== 'approved') {
      console.error(`✗ La obra "${art.name}" tiene status="${art.status}" (se requiere 'approved').`);
      return;
    }

    const existing = await findActiveTagByArt(art.id);
    if (existing) {
      console.error(`✗ La obra "${art.name}" (id=${art.id}) ya tiene un tag activo: ${existing.uid}`);
      console.error(`  Revoca el anterior antes: UPDATE nfc_tags SET status='revoked' WHERE uid='${existing.uid}';`);
      return;
    }

    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Vincular tag ${uidHex} → obra "${art.name}" (id=${art.id})?`,
      initial: true,
    });
    if (!confirm) {
      console.log('Cancelado.');
      return;
    }

    const keys = deriveAllKeys(uid);
    console.log('🔐 Claves derivadas (no se imprimen por seguridad).');

    await session.selectFile(NTAG424_NDEF_AID, isoSelectFileMode.BY_DF_NAME);

    console.log('🔄 Cambiando claves K1 → K2 → K3 → K4 → K0 ...');
    await session.authenticate(0, FACTORY_KEY);
    await session.changeKey(1, FACTORY_KEY, keys.K1, NEW_KEY_VERSION);
    await session.changeKey(2, FACTORY_KEY, keys.K2, NEW_KEY_VERSION);
    await session.changeKey(3, FACTORY_KEY, keys.K3, NEW_KEY_VERSION);
    await session.changeKey(4, FACTORY_KEY, keys.K4, NEW_KEY_VERSION);
    await session.changeKey(0, FACTORY_KEY, keys.K0, NEW_KEY_VERSION); // K0 last — critical
    console.log('✓ Claves cambiadas.');

    // Changing K0 invalidates the current session. Re-authenticate with K0
    // (the new one) before writing NDEF and FileSettings.
    await session.authenticate(0, keys.K0);

    console.log('📝 Escribiendo NDEF...');
    await session.writeData('plain', FILE_NDEF, NDEF_BUFFER, 0);

    console.log('⚙️  Configurando SDM...');
    await session.setFileSettings(FILE_NDEF, SDM_FILE_SETTINGS_OPEN, NTAG_TAG_PARAMS);
    console.log('✓ NDEF escrito y SDM configurado.');

    const year = new Date().getFullYear();
    const serial = `GAL-${year}-${String(art.id).padStart(4, '0')}`;
    await insertNfcTag({
      uid: uidHex,
      artId: art.id,
      serialLabel: serial,
      operator: OPERATOR,
    });
    registeredInDb = true;
    console.log(`✓ Insertado en BD con serial ${serial}.\n`);

    bannerDone(uidHex, art);
  } catch (err) {
    console.error('✗ Error procesando el tag:', err.message);
    if (uidHex && registeredInDb) {
      try {
        await markAsDamaged(uidHex, `Fallo durante personalize.js: ${err.message}`);
        console.error(`  Marcado como damaged en BD: UID ${uidHex}`);
      } catch (dbErr) {
        console.error('  Además, no se pudo marcar como damaged en BD:', dbErr.message);
      }
    }
    console.error('  Anota el UID y descarta físicamente la pegatina o investiga con `npm run inspect`.');
  }
}

function main() {
  bannerStart();
  const nfc = new NFC();

  nfc.on('reader', (reader) => {
    console.log(`✓ Lector conectado: ${reader.name}\n`);
    reader.autoProcessing = false;
    reader.on('card', (tag) => {
      if (tag.type !== TAG_ISO_14443_4) {
        console.warn(`Tag detectado pero no soportado (type=${tag.type}). Ignorando.`);
        return;
      }
      processCard(reader);
    });
    reader.on('error', (err) => console.error('Error de lector:', err.message));
    reader.on('end', () => console.log(`Lector ${reader.name} desconectado.`));
  });

  nfc.on('error', (err) => console.error('Error NFC:', err.message));
}

main();
