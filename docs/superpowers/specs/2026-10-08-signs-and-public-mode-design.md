# Road Signs Library + Public Mode Design

Date: 2026-10-08

## Problem

Driving-code students need a reference to learn what each road sign means.
Today the app only has exam series + questions; there is no way to browse
signs or their explanations. Separately, the school wants to control whether
the landing page (and the signs reference) is viewable without a login.

## Goals

- Add a **Signs** entity: name, category, sign image, explanation, optional
  scenario image.
- Let admins CRUD signs, grouped into French sign families.
- Let students browse signs grouped by category.
- Add a **public mode** toggle: when on, anonymous visitors can see the
  landing page and the signs library (exams/history/revision still require
  login). When off, current behavior is preserved (login required).

## Non-goals

- Per-section visibility toggles (series vs signs) — single global toggle
  only for now.
- Student-side sign favorites / progress tracking.

## Approach chosen

Option A: single global `site_public` setting in a `settings` key/value
table. Recommended over per-section toggles (Option B) — simpler, matches
the request, easy to extend later.

## Data model (migration `005_signs.sql`)

### `signs`

| Column                | Type    | Notes                                   |
| --------------------- | ------- | --------------------------------------- |
| id                    | TEXT PK | uuid                                    |
| title                 | TEXT NN | sign name (e.g. "Cédez le passage")     |
| category              | TEXT NN | one of the French sign families         |
| image_url             | TEXT    | the sign itself (required at UI level)  |
| description           | TEXT    | explanation of what the sign means      |
| scenario_image_url    | TEXT    | optional second image (road scenario)   |
| is_active             | INT NN  | default 1                               |
| position              | INT NN  | default 0 (display order within cat)    |
| created_at / updated_at | TEXT  | iso8601                                 |

Sign categories (fixed client + server constant, easy to extend):

- Danger
- Interdiction
- Obligation
- Indication
- Précédence
- Signalisation temporaire

### `settings`

`key TEXT PK`, `value TEXT NN`. Seed: `site_public = '0'`.

## Backend

- `server/routes/signs.ts` (Hono, mirrors `series.ts`):
  - `GET /api/signs` — active signs, ordered by category + position. Accepts
    `?all=true` for admins (include inactive).
  - `GET /api/signs/:id`
  - `POST /api/signs` (admin) — validates title; applies category, is_active,
    position default (max+1).
  - `PUT /api/signs/:id` (admin)
  - `DELETE /api/signs/:id` (admin)
  - Serializer `toSign` in `server/serialize.ts`; `Sign`/`SignInput` types in
    `src/types/index.ts`.
- `server/routes/settings.ts`:
  - `GET /api/settings/public` — returns `{ site_public: boolean }`
    (unauthenticated, so the landing page can decide).
  - `PUT /api/settings` (admin) — body `{ site_public: boolean }`, upserts
    the row.
- Register both routers in `server/index.ts`.
- Image uploads reuse existing `/api/upload` R2 presign flow +
  `src/components/admin/ImageUpload.tsx` (sign image + scenario image).

## Frontend

- **Student/public:**
  - New `src/pages/student/Signs.tsx` — signs fetched via `api.get('/signs')`,
    grouped by `category`, each card shows the sign image + name, expandable
    to reveal explanation and scenario image.
  - New `src/pages/Landing.tsx` — when `site_public` is on and no user is
    logged in, `/` renders a public landing with hero, series grid (locked —
    "connectez-vous pour commencer"), CTA to `/signs` and login.
  - `App.tsx`: new routes `/signs` and public-aware `/`. Access rule:
    - `/` + `/signs`: allowed for logged-in users; allowed for anonymous
      only when `site_public` is on, otherwise redirect to `/login`.
    - Exams (`/exam/:id`, `/revision*`, `/history`) always require login
      (unchanged `StudentRoute`).
  - `SiteHeader.tsx`: add "Panneaux" nav link.
- **Admin:**
  - New `src/pages/admin/AdminSigns.tsx` — list/create/edit/delete signs,
    category select, ImageUpload for both images, active toggle, reorder
    arrows. Mirrors `SeriesDetail`. Route `/admin/signs`.
  - New `src/components/admin/SignFormModal.tsx`.
  - `AdminDashboard.tsx`: add "Panneaux" link + a **public mode toggle**
    (switch bound to `site_public`).

## Error handling

- Backend returns `{ error }` JSON with 400/401/403/404 statuses; frontend
  maps to French-friendly messages and inline form errors (existing pattern).

## Testing

- `npx tsc -b` (typecheck) and `npm run build` (vite).
- Start server locally; migrations must apply cleanly; verify:
  - Admin can create/edit/delete signs (sign + scenario images).
  - `GET /api/signs` hides inactive unless `?all=true` + admin.
  - Toggle `site_public` on → anonymous can view landing + `/signs`;
    off → anonymous redirected to `/login`.
  - Exams/history/revision still require login in both modes.