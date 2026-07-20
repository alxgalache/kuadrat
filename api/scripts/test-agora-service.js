/**
 * One-shot manual test for api/services/agoraService.js (task 2.4 of
 * add-agora-streaming-provider). Requires AGORA_* variables in api/.env.
 *
 * Run inside the api container:
 *   docker compose exec api node scripts/test-agora-service.js
 *
 * What it does:
 *   1. Generates a PUBLISHER and a SUBSCRIBER token and sanity-checks the
 *      AccessToken2 envelope (version "007" + base64 payload).
 *   2. Creates a publish kicking rule against the REAL Agora project
 *      (channel 'kuadrat-selftest', uid 999), verifies it appears in the
 *      rule list, then deletes it. Leaves no residue.
 */
const agoraService = require('../services/agoraService');
const config = require('../config/env');

function decodeCheck(token, label) {
  if (!token.startsWith('007')) throw new Error(`${label}: unexpected version prefix`);
  const raw = Buffer.from(token.slice(3), 'base64');
  if (raw.length < 20) throw new Error(`${label}: payload too short`);
  console.log(`  ✔ ${label} token OK (len=${token.length}, payload=${raw.length} bytes)`);
}

async function main() {
  console.log('— Agora service self-test —');
  console.log(`appId: ${config.agora.appId ? config.agora.appId.slice(0, 6) + '…' : '(vacío)'}`);

  // 1. Tokens
  const channel = 'kuadrat-selftest';
  const pub = agoraService.generateRtcToken({ channel, uid: agoraService.HOST_UID, role: 'publisher' });
  decodeCheck(pub, 'PUBLISHER');
  const sub = agoraService.generateRtcToken({ channel, uid: 101, role: 'subscriber' });
  decodeCheck(sub, 'SUBSCRIBER');
  if (pub === sub) throw new Error('PUBLISHER and SUBSCRIBER tokens are identical');

  // 2. Cleanup: remove any leftover selftest rules from previous runs
  //    (e.g. when a gateway 504 aborted the delete step)
  const cleaned = await agoraService.liftPublishBan(channel, 999);
  if (cleaned) console.log('  ℹ regla(s) residual(es) de una ejecución anterior eliminada(s)');

  // 3. Kicking rule create + delete (real REST call)
  const ruleId = await agoraService.banPublish(channel, 999);
  console.log(`  ✔ kicking rule created (id=${ruleId})`);
  const lifted = await agoraService.liftPublishBan(channel, 999);
  if (!lifted) throw new Error('liftPublishBan did not find the rule it just created');
  console.log('  ✔ kicking rule deleted');

  console.log('— Todo OK —');
  process.exit(0);
}

main().catch((err) => {
  console.error('✖ Self-test failed:', err.message);
  process.exit(1);
});
