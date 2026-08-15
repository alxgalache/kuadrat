#!/usr/bin/env node
/**
 * Permanently lock the NDEF (File 02) of a personalized NTAG 424 DNA sticker.
 *
 *   ⚠️ ⚠️ ⚠️  IRREVERSIBLE OPERATION  ⚠️ ⚠️ ⚠️
 *
 * After this script succeeds, the sticker's NDEF and SDM configuration can
 * never be modified again — not by us, not by anyone. Run it only after
 * verifying with a phone that the sticker works as expected over several
 * days.
 *
 * Usage:
 *   npm run lock -- <UID>
 */

import 'dotenv/config';

import { NFC, TAG_ISO_14443_4 } from 'nfc-pcsc';
import prompts from 'prompts';

import {
  createTagSession,
  isoSelectFileMode,
  NTAG424_NDEF_AID,
  FILE_NDEF,
  SDM_FILE_SETTINGS_LOCKED,
  NTAG_TAG_PARAMS,
} from './lib/ntag424.js';
import { deriveAllKeys } from './lib/crypto.js';
import { getTagByUid, markAsLocked } from './lib/db.js';

const expectedUidArg = process.argv[2];
if (expectedUidArg && !/^[0-9a-fA-F]{14}$/.test(expectedUidArg)) {
  console.error('UID inválido. Debe ser 14 caracteres hex (7 bytes).');
  process.exit(1);
}
const expectedUidHex = expectedUidArg ? expectedUidArg.toUpperCase() : null;

function bannerStart() {
  console.log('🔒 140d Galería de Arte — Bloqueo permanente NTAG 424 DNA\n');
  console.log('⚠️  ATENCIÓN: este paso es IRREVERSIBLE.');
  console.log('   Tras ejecutar, la URL y la configuración SDM del tag quedan');
  console.log('   bloqueadas en hardware. Si hay cualquier error en la pegatina,');
  console.log('   será inutilizable y tendrás que reemplazarla físicamente.\n');
  if (expectedUidHex) {
    console.log(`   UID esperado: ${expectedUidHex}`);
  }
  console.log('Coloca la pegatina sobre el lector...\n');
}

/** Select the NDEF application and open an authenticated K0 session. */
async function authenticate(session, k0) {
  await session.selectFile(NTAG424_NDEF_AID, isoSelectFileMode.BY_DF_NAME);
  await session.authenticate(0, k0);
}

async function processCard(reader) {
  const session = createTagSession(reader);

  try {
    const uid = await session.getUid();
    const uidHex = uid.toString('hex').toUpperCase();

    if (expectedUidHex && uidHex !== expectedUidHex) {
      console.error(`✗ UID del tag (${uidHex}) no coincide con el esperado (${expectedUidHex}).`);
      console.error('  Retira la pegatina equivocada y coloca la correcta, o cancela con Ctrl+C.');
      return;
    }

    const tag = await getTagByUid(uidHex);
    if (!tag) {
      console.error(`✗ Tag ${uidHex} no encontrado en BD. ¿Lo has personalizado?`);
      return;
    }
    if (tag.is_permanently_locked === 1) {
      console.error(`✗ Tag ${uidHex} ya está marcado como bloqueado en BD.`);
      return;
    }
    if (tag.status !== 'active') {
      console.error(`✗ Tag ${uidHex} está en estado "${tag.status}", no se puede bloquear.`);
      return;
    }

    console.log(`Tag ${uidHex} corresponde a la obra: "${tag.art_name}"`);

    const keys = deriveAllKeys(uid);
    await authenticate(session, keys.K0);

    // Read the chip's current FileSettings BEFORE touching anything.
    // ChangeFileSettings is itself gated by `change`, so once the lock landed
    // it can never be issued again: a retry after a run that failed *after*
    // the write (e.g. the old `settingsAfter.access` bug) must reconcile the
    // database instead of re-issuing the command.
    const before = await session.getFileSettings(FILE_NDEF);
    if (before.accessRights.change === 0xf) {
      console.log('\nℹ️  El chip YA está bloqueado en hardware, pero la BD no lo refleja.');
      console.log(`   FileSettings: ${JSON.stringify(before.accessRights)}`);
      console.log('   No hay nada que escribir en el tag; sólo falta reconciliar la BD.\n');

      const { reconcile } = await prompts({
        type: 'confirm',
        name: 'reconcile',
        message: `¿Marcar ${uidHex} como bloqueado en la BD?`,
        initial: true,
      });
      if (!reconcile) {
        console.log('Cancelado. La BD sigue sin reflejar el lock.');
        return;
      }

      await markAsLocked(uidHex);
      console.log(`\n✓ BD reconciliada: tag ${uidHex} marcado como bloqueado.`);
      return;
    }

    const { tapped } = await prompts({
      type: 'confirm',
      name: 'tapped',
      message: '¿Has verificado que el tap con el móvil funciona correctamente con esta pegatina?',
      initial: false,
    });
    if (!tapped) {
      console.log('Verifica primero con el móvil. Bloqueo cancelado.');
      return;
    }

    const { confirmLock } = await prompts({
      type: 'confirm',
      name: 'confirmLock',
      message: '⚠️  Confirma el bloqueo PERMANENTE e IRREVERSIBLE',
      initial: false,
    });
    if (!confirmLock) {
      console.log('Bloqueo cancelado.');
      return;
    }

    // The operator may have taken a while over the two confirmations. Re-auth
    // so the write never runs on a session the chip has already dropped.
    await authenticate(session, keys.K0);

    console.log('🔒 Aplicando el lock permanente...');
    await session.setFileSettings(FILE_NDEF, SDM_FILE_SETTINGS_LOCKED, NTAG_TAG_PARAMS);

    // Verify by reading back FileSettings. A successful lock means change=0xf.
    // NOTE: getFileSettings returns `accessRights` (GetFileSettings shape);
    // `access` is the shape setFileSettings *takes*. Reading `.access` here
    // threw a TypeError after the lock had already been written to hardware.
    const settingsAfter = await session.getFileSettings(FILE_NDEF);
    if (settingsAfter.accessRights.change !== 0xf) {
      throw new Error(
        `Lock no aplicado correctamente: change=${settingsAfter.accessRights.change} (esperado 0xf). ` +
        `Estado del chip: ${JSON.stringify(settingsAfter.accessRights)}`,
      );
    }
    console.log('✓ FileSettings tras lock:', JSON.stringify(settingsAfter.accessRights));

    await markAsLocked(uidHex);
    console.log(`\n🔒 Tag ${uidHex} bloqueado permanentemente y registrado en BD.`);
    console.log('   Cualquier intento futuro de modificar este NDEF fallará.');
  } catch (err) {
    console.error('✗ Error durante el bloqueo:', err.message);
    console.error('  Revisa con `npm run inspect` el estado actual del tag.');
    console.error('  Si `lock NDEF` sale como SÍ, el chip quedó bloqueado: vuelve a');
    console.error('  ejecutar este script y acepta la reconciliación de la BD.');
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
  });
  nfc.on('error', (err) => console.error('Error NFC:', err.message));
}

main();
