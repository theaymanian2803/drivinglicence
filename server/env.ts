import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnvFile(file: string): void {
  const envPath = path.resolve(process.cwd(), file);
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      if (process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      value = value.replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  } catch {
    // .env not present — fall back to shell environment
  }
}

loadEnvFile('.env');