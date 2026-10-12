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
    return c.json({ error: 'نوع المحتوى مطلوب' }, 400);
  }
  if (!Number.isFinite(size)) {
    return c.json({ error: 'يجب أن يكون الحجم عدداً بالبايت' }, 400);
  }

  try {
    const result = await createPresignedImageUpload({ contentType, size });
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof Error && /Missing:/.test(err.message)) {
      return c.json({ error: 'رفع الصور غير مُهيّأ على الخادم.' }, 503);
    }
    console.error('Failed to presign R2 upload:', err);
    return c.json({ error: 'تعذّر تجهيز الرفع. حاول مجدداً.' }, 500);
  }
});
