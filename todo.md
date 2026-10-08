# Desktop App Conversion — Brainstorm Todo (carried over)

> Status: NOT STARTED — captured from the 2026-09-24 session so the brainstorm can be
> resumed later. See the conversation handoff above if needed.

## Context

Current stack (already migrated to Turso):

- Frontend: React 18 + Vite + Tailwind (student exam UI + admin panel)
- Backend: Hono API (`server/`) in the same repo, runs as its own Node process on `:3001`
- DB: Turso remote (`libsql://driving-unccode.aws-eu-west-1.turso.io`) with `file:local.db` fallback
- Auth: JWT httpOnly cookie; first admin bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD`
- Frontend calls `/api/*` (relative) through the Vite dev proxy in dev, bundled SPA in prod

## Goal (from conversation)

Turn the web app into a desktop application ("what should we do" → Electron was
recommended because the backend is already Node).

## Brainstorm phase — questions to answer first (one at a time, later)

- [ ] Primary platform (Windows / macOS / Linux / all)?
- [ ] Installers needed (NSIS inno / MSI / dmg / AppImage)? Signed or unsigned?
- [ ] Auto-update required, or manual reinstall is fine?
- [ ] Does the app need to work fully offline? (Currently requires Turso network.)
  - If yes: move DB to `local.db` inside `app.getPath('userData')`, or keep Turso + offline cache?
- [ ] App icon + branding (name, icon file, window title)?
- [ ] Keep the admin panel inside the desktop app, or strip it?
- [ ] Any packaging preference: electron-builder vs electron-forge vs Tauri?
- [ ] Do we still run `npm run dev` against the web build, or only ship a packaged exe?

## Approaches considered

| Option  | Pros  | Cons | Verdict |
|---------|-------|------|---------|
| **Electron** | Backend already Node; embed Hono in main process; smallest migration; biggest ecosystem | ~120MB+ binaries | Recommended |
| Tauri | Small/fast binaries, modern | Needs Rust toolchain; Node backend becomes a sidecar (more moving parts) | Fallback if size matters |
| PWA | Cheapest, "installable" now | Not a real native app/installer | Least "desktop" |

## Implementation checklist (later, after brainstorm is approved)

- [ ] **Decide + document** the answers above
- [ ] **API base URL**: change `src/lib/db.ts` to hit `http://127.0.0.1:3001/api` in the built app (dev keeps relative `/api` + Vite proxy)
- [ ] **Bundle the server**: `server/` → single file (esbuild/tsup) so Electron can spawn it via `node`
- [ ] **Electron main process**:
  - [ ] start Hono (`@hono/node-server`) bound to `127.0.0.1:3001` (or ephemeral port)
  - [ ] wait for health check before opening window
  - [ ] create `BrowserWindow` loading built `dist/index.html`
  - [ ] security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  - [ ] quit when window closed → kill server child
- [ ] **Data dir**: if offline mode chosen, point `local.db` to `app.getPath('userData')` instead of cwd
- [ ] **Packaging**: electron-builder config (appId, icon, target installers, version)
- [ ] **Files likely touched**: `src/lib/db.ts`, new `electron/` main script, `vite.config.ts` (base path for file:// loading),
      `package.json` (main, build config), possibly `.env.example`
- [ ] **Verify**:
  - [ ] `npm run build` passes
  - [ ] packaged app boots → Turso auth login works → student exam + admin CRUD work
  - [ ] no dev-server dependencies at runtime (frontend prod build + embedded API only)
- [ ] **Checklist**: typecheck + lint + build on every change

## Open notes

- Turso is already remote/cloud → multi-device data sharing works for free in a desktop app
- bcryptjs/jose all run fine under Node (already verified) so no backend rewrite needed
- `.env` already auto-loaded via `server/env.ts` — Electron main must load `.env` before importing server modules