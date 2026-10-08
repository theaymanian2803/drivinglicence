import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 300;
const IMAGE_PREFIX = 'questions';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function requireConfig(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicDomain: string;
} {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicDomain = process.env.R2_PUBLIC_DOMAIN?.trim();

  const missing = [
    !accountId && 'R2_ACCOUNT_ID',
    !accessKeyId && 'R2_ACCESS_KEY_ID',
    !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
    !bucket && 'R2_BUCKET_NAME',
    !publicDomain && 'R2_PUBLIC_DOMAIN',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`R2 upload is not configured. Missing: ${missing.join(', ')}`);
  }

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    publicDomain: publicDomain!,
  };
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    const cfg = requireConfig();
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

export async function createPresignedImageUpload(input: {
  contentType: string;
  size: number;
}): Promise<PresignedUpload> {
  const extension = ALLOWED_TYPES[input.contentType];
  if (!extension) {
    throw new UploadValidationError(
      `Unsupported image type "${input.contentType}". Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}`
    );
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new UploadValidationError('File is empty.');
  }
  if (input.size > MAX_IMAGE_BYTES) {
    throw new UploadValidationError(
      `File is ${(input.size / 1024 / 1024).toFixed(1)} MB. Maximum is ${
        MAX_IMAGE_BYTES / 1024 / 1024
      } MB.`
    );
  }

  const cfg = requireConfig();
  // Key is derived server-side only: the client never influences the path.
  const key = `${IMAGE_PREFIX}/${randomUUID()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: input.contentType,
    // Signing ContentLength makes R2 reject an oversized or truncated body.
    ContentLength: input.size,
  });

  const uploadUrl = await getSignedUrl(getClient(), command, {
    expiresIn: PRESIGN_TTL_SECONDS,
  });

  const publicUrl = `${cfg.publicDomain.replace(/\/+$/, '')}/${key}`;

  return { uploadUrl, publicUrl, key };
}

export class UploadValidationError extends Error {}
