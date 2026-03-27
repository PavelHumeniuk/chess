# Chess App — Google OAuth + SQLite Integration Plan

## Overview

Add Google OAuth 2.0 authentication and SQLite-based progress persistence to the chess training app. Each user logs in with their Google account and gets their own puzzle progress, SRS data, and stats — synced across all devices.

---

## Stack Additions

- **Auth**: Google OAuth 2.0 (via Google Identity Services)
- **Frontend library**: `@react-oauth/google`
- **Backend library**: `google-auth-library`
- **Database**: SQLite via `better-sqlite3`
- **Sessions**: JWT (short-lived access token stored in localStorage)
- **Optional whitelist**: allowed emails defined in `.env` (to restrict access to yourself only)

---

## Database Schema

Single SQLite file: `backend/data/chess.db`

### Table: `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `puzzle_progress`

```sql
CREATE TABLE IF NOT EXISTS puzzle_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  puzzle_id TEXT NOT NULL,
  bucket INTEGER DEFAULT 0,          -- SRS bucket: 0=new, 1=familiar, 2=learned
  next_review DATE NOT NULL,
  reps INTEGER DEFAULT 0,
  solved INTEGER DEFAULT 0,          -- total solved count
  failed INTEGER DEFAULT 0,          -- total failed count
  last_seen DATETIME,
  UNIQUE(user_id, puzzle_id)
);
```

### Table: `sessions` (optional, if not using stateless JWT)

> Prefer stateless JWT — skip this table unless you need server-side session invalidation.

---

## Backend Changes

### New file: `backend/db.js`

- Initialize SQLite connection using `better-sqlite3`
- Run `CREATE TABLE IF NOT EXISTS` for all tables on startup
- Export reusable prepared statements:
  - `findOrCreateUser(googleId, email, name, avatar)`
  - `getPuzzleProgress(userId, puzzleId)`
  - `upsertPuzzleProgress(userId, puzzleId, bucket, nextReview, reps, solved, failed)`
  - `getDueToday(userId)` — returns all puzzles where `next_review <= today`
  - `getAllProgress(userId)` — returns full progress dump

### New file: `backend/auth.js`

- `POST /auth/google`
  - Accepts `{ credential }` — the Google ID token from the frontend
  - Verifies token using `google-auth-library` OAuth2Client
  - Extracts `sub` (google_id), `email`, `name`, `picture`
  - If `ALLOWED_EMAILS` is set in `.env`, check that email is in the list — return 403 if not
  - Call `findOrCreateUser(...)` to get or create the user record
  - Sign and return a JWT: `{ userId, email, name, avatar }` with expiry `30d`

- `GET /auth/me`
  - Requires JWT in `Authorization: Bearer ...` header
  - Returns current user info or 401

### New middleware: `backend/middleware/requireAuth.js`

- Extract JWT from `Authorization` header
- Verify with `jsonwebtoken`
- Attach `req.user = { id, email, name }` to the request
- Return 401 if missing or invalid

### Modified: puzzle progress endpoints

All existing puzzle progress routes should now:
- Use `requireAuth` middleware
- Scope all DB queries to `req.user.id`

New endpoints:

- `GET /api/progress/due` — returns puzzles due today for the current user
- `POST /api/progress/:puzzleId` — upsert progress after solving a puzzle
  - Body: `{ bucket, nextReview, solved, failed, reps }`
- `GET /api/progress/all` — full progress dump (for stats page)

### Environment variables to add to `.env`

```env
JWT_SECRET=some_long_random_string
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
ALLOWED_EMAILS=your@gmail.com,friend@gmail.com   # optional whitelist
```

---

## Frontend Changes

### New file: `src/context/AuthContext.jsx`

- Wrap the app in `GoogleOAuthProvider` with `clientId` from env
- Store JWT in `localStorage` under key `chess_token`
- Expose: `user`, `login(credential)`, `logout()`
- On mount: if token exists, call `GET /auth/me` to restore session
- If 401 — clear token and show login screen

### New file: `src/pages/LoginPage.jsx`

- Centered layout with app name
- Single `GoogleLogin` button from `@react-oauth/google`
- On success: call `POST /auth/google` with the credential, store returned JWT
- On failure: show error message

### Modified: `src/App.jsx`

- If `user` is null — render `<LoginPage />`
- If `user` exists — render the app as normal
- Add user avatar + name + logout button in the top corner

### Modified: puzzle progress logic

- All progress read/write should go through the new API endpoints instead of localStorage
- On app load: fetch `GET /api/progress/due` to populate today's review queue
- After solving a puzzle: `POST /api/progress/:puzzleId` with updated SRS data

### Environment variable

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

---

## Docker Changes

### `backend/Dockerfile`

- Add volume mount point for SQLite file: `/app/data`
- The `chess.db` file lives in this directory

### `docker-compose.yml`

Add named volume for the database so it persists across container restarts and deploys:

```yaml
volumes:
  chess_db:

services:
  backend:
    volumes:
      - chess_db:/app/data
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - ALLOWED_EMAILS=${ALLOWED_EMAILS}
```

Add a `.env` file on the VPS at `~/chess-app/.env` with the secrets. GitHub Actions should NOT commit secrets — pass them via the `.env` file on the server.

---

## What You Need to Do Manually (in order)

### Step 1 — Google Cloud Console: create OAuth app

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Chess App")
3. Go to **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name, your email
   - No need to add scopes beyond the defaults
   - Add your Gmail as a test user
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `https://chess.domain.com`
     - `http://localhost:5173` (for local dev)
   - Authorized redirect URIs: leave empty (not needed for Google Identity Services)
5. Copy the **Client ID** — you'll need it in the next steps

### Step 2 — Add Client ID to your project

- Add to `frontend/.env`:
  ```
  VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
  ```
- Add to `backend/.env`:
  ```
  GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
  JWT_SECRET=generate_a_random_64_char_string
  ALLOWED_EMAILS=your@gmail.com
  ```

### Step 3 — Add `.env` to VPS

SSH into your VPS and create the env file:
```bash
nano ~/chess-app/.env
```
Paste the backend env variables. This file is never committed to git.

### Step 4 — Add GitHub Actions secret for env (optional)

If you want GitHub Actions to write the `.env` file automatically on deploy, add a `ENV_FILE` secret in GitHub with the full contents of the `.env` file, then in your deploy workflow:

```yaml
- name: Write .env file
  run: echo "${{ secrets.ENV_FILE }}" > ~/chess-app/.env
```

### Step 5 — Deploy and test

1. Push to `main` — GitHub Actions builds and deploys
2. Open `https://chess.domain.com`
3. You should see the login page with a Google button
4. Sign in — you should land on the app
5. Solve a puzzle — progress should persist after refresh and on mobile

---

## Local Development Flow

```bash
# Backend
cd backend
cp .env.example .env   # fill in your Google Client ID and JWT secret
node server.js

# Frontend
cd frontend
cp .env.example .env   # fill in VITE_GOOGLE_CLIENT_ID
npm run dev
```

SQLite file will be created automatically at `backend/data/chess.db` on first run.