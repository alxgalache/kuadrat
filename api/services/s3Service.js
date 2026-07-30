const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const config = require('../config/env');
const logger = require('../config/logger');

let s3Client = null;

// Clients are per-region, so the media bucket and the database-backup bucket
// can live in different regions without instantiating a client per upload.
// No credentials are passed anywhere: the SDK resolves them through its default
// chain, which on the production EC2 instance means the instance IAM role.
const clientsByRegion = new Map();

function getClient() {
  if (!s3Client) {
    if (!config.aws.s3Bucket) {
      throw new Error('AWS S3 is not configured (AWS_S3_BUCKET missing)');
    }
    s3Client = new S3Client({ region: config.aws.s3Region });
  }
  return s3Client;
}

function getClientForRegion(region) {
  if (!clientsByRegion.has(region)) {
    clientsByRegion.set(region, new S3Client({ region }));
  }
  return clientsByRegion.get(region);
}

/**
 * Upload an object to an explicitly named bucket and region.
 *
 * Used by the database backup, which writes to a bucket other than the media
 * one. Media uploads keep going through uploadFile().
 *
 * @param {object} params
 * @param {string} params.bucket - Destination bucket
 * @param {string} params.region - Bucket region
 * @param {string} params.key - Object key
 * @param {Buffer|string} params.body - Object contents
 * @param {string} params.contentType - MIME type
 * @returns {Promise<string>} The key that was uploaded
 */
async function uploadObject({ bucket, region, key, body, contentType }) {
  if (!bucket) {
    throw new Error('uploadObject requires a bucket name');
  }
  const client = getClientForRegion(region || config.aws.s3Region);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    // Deliberately no ContentEncoding. A .sql.gz *is* a compressed file, not a
    // text file transferred compressed; declaring the encoding makes some
    // clients inflate it on download, and the bytes would then no longer match
    // the SHA-256 recorded in the manifest.
  }));
  return key;
}

/**
 * Upload a file to S3.
 * @param {string} key - S3 object key (e.g. 'art/uuid.jpg')
 * @param {Buffer} buffer - File contents
 * @param {string} mimetype - MIME type (e.g. 'image/jpeg')
 * @returns {Promise<string>} The key that was uploaded
 */
async function uploadFile(key, buffer, mimetype) {
  // The guard stays here so the error message for an unconfigured media bucket
  // is unchanged; the upload itself goes through the shared path.
  if (!config.aws.s3Bucket) {
    throw new Error('AWS S3 is not configured (AWS_S3_BUCKET missing)');
  }
  return uploadObject({
    bucket: config.aws.s3Bucket,
    region: config.aws.s3Region,
    key,
    body: buffer,
    contentType: mimetype,
  });
}

/**
 * Delete a file from S3. Best-effort: logs errors but does not throw.
 * @param {string} key - S3 object key to delete
 */
async function deleteFile(key) {
  try {
    const client = getClient();
    await client.send(new DeleteObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: key,
    }));
  } catch (err) {
    logger.error({ err, key }, 'Failed to delete file from S3');
  }
}

/**
 * List files in S3 under a given prefix.
 * @param {string} prefix - S3 key prefix (e.g. 'stories/')
 * @returns {Promise<string[]>} Array of filenames (without the prefix)
 */
async function listFiles(prefix) {
  const client = getClient();
  const response = await client.send(new ListObjectsV2Command({
    Bucket: config.aws.s3Bucket,
    Prefix: prefix,
  }));

  if (!response.Contents) return [];

  return response.Contents
    .map(obj => obj.Key)
    .filter(key => key !== prefix) // exclude the prefix itself if listed
    .map(key => key.replace(prefix, ''));
}

module.exports = { uploadFile, uploadObject, deleteFile, listFiles };
