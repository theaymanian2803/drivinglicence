import { handle } from 'hono/vercel';
import { buildApp } from './app';
import { init } from './db';

let ready: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (!ready) ready = init();
  await ready;
}

const app = buildApp();
const handler = handle(app);

async function serve(req: Request): Promise<Response> {
  await ensureReady();
  return handler(req);
}

export const GET = serve;
export const POST = serve;
export const PUT = serve;
export const PATCH = serve;
export const DELETE = serve;