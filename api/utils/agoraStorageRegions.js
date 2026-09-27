/**
 * Amazon S3 region → the numeric `region` code Agora Cloud Recording expects
 * in `storageConfig` (vendor 1). Source: Agora's "Third-party cloud storage
 * regions" reference. Only the European regions are listed: recordings hold
 * the image and voice of EU participants and must stay in the EU.
 *
 * Required by `config/env.js` (an unmapped region fails startup) and by
 * `services/agoraRecordingService.js`, so the table exists exactly once.
 */
const AGORA_S3_REGION_CODES = Object.freeze({
  'eu-west-1': 4, // Ireland
  'eu-west-2': 5, // London
  'eu-west-3': 6, // Paris
  'eu-central-1': 7, // Frankfurt
  'eu-north-1': 21, // Stockholm
  'eu-south-1': 25, // Milan
});

function agoraRegionCodeFor(awsRegion) {
  return Object.prototype.hasOwnProperty.call(AGORA_S3_REGION_CODES, awsRegion)
    ? AGORA_S3_REGION_CODES[awsRegion]
    : null;
}

module.exports = { AGORA_S3_REGION_CODES, agoraRegionCodeFor };
