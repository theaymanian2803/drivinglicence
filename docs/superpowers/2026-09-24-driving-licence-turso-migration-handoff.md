# Driving Licence — Turso Migration Handoff

Bolt-generated exam app migrated from Supabase to a local Turso (SQLite) backend with a
self-hosted Hono API + JWT admin auth. No Supabase credentials or network services
required.

## Run

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "your-strong-password"
npm run dev
```

- Student exams: http://localhost:5173
- Admin (login with ADMIN_EMAIL/ADMIN_PASSWORD): http://localhost:5173/admin

On first boot the server creates `local.db` (SQLite, gitignored), applies migrations,
seeds one active "Series 1", and creates the admin user from the env vars.

## Architecture

| Layer     | Tech                                                                 |
|-----------|----------------------------------------------------------------------|
| Frontend  | React + Vite + Tailwind (unchanged UI)                               |
| Backend   | Hono + @hono/node-server, `server/index.ts`, port 3001               |
| Database  | Turso client (`@libsql/client`): `TURSO_DATABASE_URL` or `file:local.db` |
| Auth      | Email + bcrypt password hash, JWT (jose) in httpOnly `token` cookie  |

- Vite proxies `/api` -> `http://localhost:3001` (see `vite.config.ts`).
- API envelope: success `{ data }`, error `{ error: "<message>" }`.
- Public: `GET /api/series` (active only), `GET /api/series/:id`,
  `GET /api/series/:id/questions`.
- Admin (JWT required): `POST/PUT/DELETE /api/series…`,
  `POST/PUT/DELETE /api/questions…`, `PATCH /api/questions/reorder`,
  `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Server sends `is_active` as 0/1 and `correct_answers` as a number array;
  the frontend converts with `!!is_active` where typed as boolean.

## Migration notes

- Signup/Inscription removed (admin bootstrap only). New admins are created by setting
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` and booting with an empty `users` table.
- Question order is tracked with `position`; the admin reorder buttons now persist the
  order via `PATCH /api/questions/reorder` (this also fixes the old Bolt ordering bug
  which only mutated `updated_at`).
- `@supabase/supabase-js` and `src/lib/supabase.ts` removed; delete `local.db` any time
  to reset data (admin + seed recreated on next boot).

## Use remote Turso instead of the local file

1. `npm install -g turso` then `turso db create driving-licence` and
   `turso db tokens create driving-licence`.
2. In `.env` (copy from `.env.example`):

```
TURSO_DATABASE_URL=libsql://<db>.turso.io
TURSO_AUTH_TOKEN=<token>
```

Set `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`JWT_SECRET` in `.env` too — `server/env.ts` loads `.env` at boot (shell env vars take precedence).