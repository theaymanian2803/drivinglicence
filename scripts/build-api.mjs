import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [path.join(root, 'server', 'serverless.ts')],
  outfile: path.join(root, 'api', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  packages: 'external',
  logLevel: 'info',
});

if (result.errors.length > 0) {
  console.error('esbuild failed', result.errors);
  process.exit(1);
}
console.log('[build-api] wrote api/index.js');