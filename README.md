# ♟️ Chess Training Application

A full-stack chess training application featuring SRS-based (Spaced Repetition System) puzzle learning, interactive boards, and real-time stockfish-powered analysis.

---

## 🏗️ Project Structure

This project is a monorepo consisting of:
-   **`/frontend`**: React + Vite application with TypeScript and Tailwind (or CSS).
-   **`/backend`**: Node.js/Express server providing chess puzzles and Stockfish analysis.

---

## 🚀 Local Development

You can now run shortcuts from the root directory to manage both services simultaneously.

### 1. Install all dependencies
```bash
npm run install:all
```

### 2. Run both services in development mode
This will start the frontend on `localhost:5173` and the backend on `localhost:3001` using `concurrently`.
```bash
npm run dev
```

### 💡 Individual Service Commands
If you need to run only one part of the app:
- **Frontend Only**: `npm run dev:frontend`
- **Backend Only**: `npm run dev:backend`
- **Tests (Frontend)**: `npm run test:frontend`
- **Lint (Frontend)**: `npm run lint:frontend`

---

## 🌐 Deployment (Docker + Traefik)

This project is configured for automated deployment to a VPS via GitHub Actions and Docker.

- **Checklist**: See [DEPLOY-CHECKLIST.md](./DEPLOY-CHECKLIST.md) for quick setup.
- **Detailed Guide**: See [DEPLOY.md](./DEPLOY.md) for advanced configuration.

### Deployment Workflow:
1.  **CI**: Every push to `main` triggers `.github/workflows/main.yml` to lint, test, and verify build for frontend and backend.
2.  **CD**: In the same `.github/workflows/main.yml` pipeline, Docker images are built/pushed to GHCR and deployment runs via SSH.

---

## 📚 Training Content

- **Training system design**: See [TRAINING-CONTENT.md](./TRAINING-CONTENT.md) for how Polgar puzzles and Silman-style endgames are sourced, selected, repeated, extended, and saved.

---

## 📝 Planned Features (Current Roadmap)
-   [ ] **Google OAuth 2.0**: Log in to sync your progress across devices.
-   [ ] **SQLite Persistence**: User-specific puzzle progress and stats stored in a persistent database.
-   [ ] **Comprehensive Stats**: Track your learning progress with deep analytics.

Refer to [plan.md](./plan.md) for the detailed implementation steps of the upcoming auth and database features.
