import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { authRoutes } from './routes/auth';
import { seriesRoutes } from './routes/series';
import { questionRoutes } from './routes/questions';
import { init } from './db';
import type { AppEnv } from './auth';

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ data: { ok: true } }));
app.route('/api/auth', authRoutes);
app.route('/api/series', seriesRoutes);
app.route('/api/questions', questionRoutes);

const port = Number(process.env.PORT ?? 3001);

init()
  .then(() => {
    serve({ fetch: app.fetch, port });
    console.log(`[server] listening on http://localhost:${port}`);
  })
  .catch((err) => {
    console.error('[server] failed to init', err);
    process.exit(1);
  });