import './env';
import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { init } from './db';

const port = Number(process.env.PORT ?? 3001);

init()
  .then(() => {
    serve({ fetch: buildApp().fetch, port });
    console.log(`[server] listening on http://localhost:${port}`);
  })
  .catch((err) => {
    console.error('[server] failed to init', err);
    process.exit(1);
  });