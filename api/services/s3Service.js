const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const config = require('../config/env');
const logger = require('../config/logger');

let s3Client = null;

function getClient() {
  if (!s3Client) {
    if (!config.aws.s3Bucket) {
      throw new Error('AWS S3 is not configured (AWS_S3_BUCKET missing)');
    }
    s3Client = new S3Client({ region: config.aws.s3Region });
  }
  return s3Client;
}

/**
 * Upload a file to S3.
 * @param {string} key - S3 object key (e.g. 'art/uuid.jpg')
 * @param {Buffer} buffer - File contents
 * @param {string} mimetype - MIME type (e.g. 'image/jpeg')
 * @returns {Promise<string>} The key that was uploaded
 */
async function uploadFile(key, buffer, mimetype) {
  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  return key;
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

module.exports = { uploadFile, deleteFile, listFiles };
