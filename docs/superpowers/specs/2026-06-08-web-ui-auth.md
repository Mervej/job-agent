# Web UI + Auth Layer — Spec

**Date:** 2026-06-08  
**Status:** Ready for implementation

---

## Goal

Add a React web dashboard and an auth layer so users can:
1. Sign in with Google (via Supabase Auth — no custom OAuth code)
2. Create and manage their profile (name, contact info, skills, experience, education)
3. Upload / replace their resume (single resume per user)
4. Copy an API key to authenticate the Chrome extension

---

## Why Supabase

- Free hosted PostgreSQL (500MB) — replaces SQLite which is wiped on every Render redeploy
- Google OAuth built-in — no `passport`, no `jsonwebtoken`, no session management code
- One `@supabase/supabase-js` client works on both frontend and backend
- Row-level security baked in

---

## Architecture Overview

```
┌─────────────────┐   signInWithOAuth    ┌──────────────────────┐
│   React SPA     │ ──── Google ───────▶ │   Supabase Auth      │
│   (web/)        │ ◀─── JWT session ─── │   (hosted)           │
│                 │                       └──────────────────────┘
│  • Login        │                                ▲
│  • Dashboard    │   REST API                     │ verify JWT
│  • Profile edit │ ── Bearer JWT ───▶ ┌───────────┴──────────┐
│  • API key copy │                    │  Express Backend      │
└─────────────────┘                    │  (src/)               │
                                       │  • /profile routes    │
┌─────────────────┐                    │  • /resumes routes    │
│ Chrome Extension│ ── Bearer API_KEY ▶│  • /apply routes      │
│  • Settings tab │                    └───────────┬───────────┘
│  • Paste API key│                                │
└─────────────────┘                    ┌───────────▼───────────┐
                                       │  Supabase PostgreSQL  │
                                       │  • profiles table     │
                                       │  • resumes table      │
                                       └───────────────────────┘
```

---

## Database Schema (Supabase PostgreSQL)

Supabase provides `auth.users` automatically. We only create application tables:

```sql
-- profiles (one per user — parsed from resume, manually editable)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  phone       TEXT,
  location    TEXT,
  linkedin    TEXT,
  github      TEXT,
  website     TEXT,
  summary     TEXT,
  skills      JSONB DEFAULT '[]',
  experience  JSONB DEFAULT '[]',  -- [{title, company, start, end, description}]
  education   JSONB DEFAULT '[]',  -- [{degree, school, year}]
  api_key     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- resumes (one per user for now)
CREATE TABLE resumes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  file_path   TEXT NOT NULL,        -- path in Supabase Storage or local disk
  parsed_text TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)                   -- single resume per user
);

-- Row-level security (users only see their own data)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "own resumes" ON resumes  FOR ALL USING (auth.uid() = user_id);
```

---

## Auth Flow

### Web UI
1. User clicks "Sign in with Google"
2. Frontend calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
3. Supabase handles the Google redirect — returns a JWT session
4. Supabase client stores session in `localStorage` automatically
5. All API calls include `Authorization: Bearer <access_token>`

### Backend (JWT verification)
```ts
// src/middleware/auth.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// On each request:
const { data: { user } } = await supabase.auth.getUser(token);
// If user is null → 401. Else attach user to req.user.
```

### Extension (API key)
- Backend also accepts `Authorization: Bearer <api_key>` where `api_key` is the UUID stored in `profiles.api_key`
- On each request, if JWT verification fails, check `profiles` table for a matching `api_key`
- No session management needed in the extension — the key never expires

---

## Backend Changes (`src/`)

### Packages to add
```
@supabase/supabase-js
```

### Packages to remove
```
better-sqlite3   (replaced by Supabase PostgreSQL)
```

### New / modified files

| File | Change |
|---|---|
| `src/middleware/auth.ts` | New — verifies Supabase JWT or API key |
| `src/api/profile.ts` | New — `GET /profile`, `PUT /profile`, `POST /profile/parse` |
| `src/services/db.ts` | Replace SQLite client with Supabase client |
| `src/api/resumes.ts` | Add `user_id` scoping |
| `src/api/apply.ts` | Add auth middleware |
| `src/index.ts` | Mount new profile routes, apply auth middleware globally |

### New routes

| Route | Auth | Description |
|---|---|---|
| `GET /profile` | JWT or API key | Get current user's profile |
| `PUT /profile` | JWT or API key | Update profile fields |
| `POST /profile/parse` | JWT or API key | Upload resume PDF → parse → populate profile |
| `GET /auth/me` | JWT | Returns `{ id, email, name, picture }` from Supabase |

---

## Frontend (`web/`)

**Stack:** Vite + React + TypeScript + React Router + `@supabase/supabase-js`  
**Dev:** `npm run dev` in `web/` runs on `localhost:5173`  
**Prod:** `npm run build` outputs `web/dist/`; Express serves it at `/app`

### Pages

#### `/app/login`
- "Sign in with Google" button → `supabase.auth.signInWithOAuth`
- Redirects to `/app/dashboard` after login

#### `/app/dashboard`
- User avatar + name from Google
- Resume status card
- "Edit Profile" and "Extension Setup" CTAs

#### `/app/profile`
- Fields: full name, email, phone, location, LinkedIn, GitHub, website, summary
- Skills (tag input)
- Work experience (accordion — add/edit/remove)
- Education (accordion — add/edit/remove)
- Resume upload area (drag-and-drop) → on upload, calls `POST /profile/parse` and populates fields
- Save → `PUT /profile`

#### `/app/settings`
- API key field (masked, reveal on click, copy button)
- Step-by-step: "1. Copy the key above  2. Open the Job Agent extension  3. Click Settings  4. Paste the key"

---

## Extension Changes (`extension/`)

### Settings tab in panel

Add a gear icon to the panel header. Settings view:
- "API Key" text input (pre-filled if already saved in `chrome.storage.local`)
- "Save" button
- "Get your key at [dashboard link]" helper text

### `background.js` — add auth header

```js
async function getAuthHeaders() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
  };
}
```

All fetch calls replace their headers with `await getAuthHeaders()`.

If backend returns `401`, panel shows: _"Connect your account — paste your API key in Settings."_

---

## New Environment Variables

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # backend only, never exposed to frontend
```

Frontend gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Vite convention).

---

## Supabase Setup Checklist (one-time manual steps)

- [ ] Create Supabase project at supabase.com
- [ ] Run the SQL schema above in the Supabase SQL editor
- [ ] Enable Google OAuth: Authentication → Providers → Google → add Client ID + Secret from Google Cloud Console
- [ ] Add redirect URL to Google Cloud Console: `https://xxxx.supabase.co/auth/v1/callback`
- [ ] Copy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` into `.env.dev` and Render dashboard

---

## Implementation Order

1. Supabase project setup + schema migration (manual, ~15 min)
2. Backend: swap SQLite → Supabase client, add auth middleware
3. Backend: profile routes + resume parse-to-profile
4. Backend: scope existing `/resumes` and `/apply` routes per user
5. Frontend: Vite + React scaffold in `web/`
6. Frontend: Login + auth session handling
7. Frontend: Dashboard + Profile page
8. Frontend: Settings page (API key)
9. Extension: Settings tab + API key storage
10. Extension: Auth headers on all fetch calls
11. Production: serve `web/dist` from Express, update `render.yaml`, add env vars to Render

---

## What Stays the Same

- All existing `/apply`, `/resumes`, `/generate` route logic — just wrapped in auth
- Render free-tier deployment (single service)
- Extension zip distribution via GitHub Releases
- `render.yaml` Blueprint (just add new env vars)
