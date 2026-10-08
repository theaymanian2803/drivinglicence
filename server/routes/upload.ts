import { Hono } from 'hono';
import { requireAdmin } from '../middleware';
import { createPresignedImageUpload, UploadValidationError } from '../r2';
import type { AppEnv } from '../auth';

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.use('/*', requireAdmin);

type SignBody = { contentType?: string; size?: number };

uploadRoutes.post('/', async (c) => {
  const body = await c.req.json<SignBody>().catch(() => ({} as SignBody));
  const contentType = body.contentType?.trim() ?? '';
  const size = Number(body.size);

  if (!contentType) {
    return c.json({ error: 'contentType is required' }, 400);
  }
  if (!Number.isFinite(size)) {
    return c.json({ error: 'size must be a number of bytes' }, 400);
  }

  try {
    const result = await createPresignedImageUpload({ contentType, size });
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof Error && /Missing:/.test(err.message)) {
      return c.json({ error: 'Image uploads are not configured on the server.' }, 503);
    }
    console.error('Failed to presign R2 upload:', err);
    return c.json({ error: 'Could not prepare the upload. Try again.' }, 500);
  }
});
