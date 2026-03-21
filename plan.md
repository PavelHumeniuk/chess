# Chess App — Deployment Plan

## Stack
- **Frontend**: React (built into static files, served by Node.js or nginx inside container)
- **Backend**: Node.js (Express) with Stockfish binary
- **Reverse proxy / SSL**: Traefik (runs as a container, auto-renews Let's Encrypt)
- **Registry**: GitHub Container Registry (ghcr.io)
- **CI/CD**: GitHub Actions

---

## Project Structure to Generate

```
chess-app/
├── frontend/                  # React app
│   ├── Dockerfile
│   └── ...
├── backend/                   # Node.js + Stockfish
│   ├── Dockerfile
│   ├── stockfish                # Stockfish binary (Linux x64)
│   └── ...
├── docker-compose.yml          # Production compose file
├── docker-compose.dev.yml      # Local dev (optional)
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## Files to Generate

### 1. `backend/Dockerfile`

- Base image: `node:20-alpine`
- Copy Stockfish binary into the image, set executable permissions (`chmod +x`)
- Install npm dependencies
- Expose port `3001`
- Start with `node server.js`

### 2. `frontend/Dockerfile`

- **Stage 1** (build): `node:20-alpine` — run `npm run build`
- **Stage 2** (serve): `nginx:alpine` — copy `/dist` from stage 1 into nginx html folder
- Expose port `80`
- No environment variables needed at runtime (API calls go to `/api/` path)

> The React app should proxy `/api/` requests to the backend. In production this is handled by Traefik routing rules, not Vite proxy. Make sure `fetch('/api/bestmove')` uses a relative path.

### 3. `docker-compose.yml`

Services:

**traefik**
- Image: `traefik:v3.0`
- Command flags:
  - `--providers.docker=true`
  - `--providers.docker.exposedbydefault=false`
  - `--entrypoints.web.address=:80`
  - `--entrypoints.websecure.address=:443`
  - `--certificatesresolvers.letsencrypt.acme.email=phuman911@gmail.com`
  - `--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json`
  - `--certificatesresolvers.letsencrypt.acme.tlschallenge=true`
- Ports: `80:80`, `443:443`
- Volumes:
  - `/var/run/docker.sock:/var/run/docker.sock:ro`
  - `letsencrypt:/letsencrypt`
- Restart: `always`

**frontend**
- Image: `ghcr.io/PavelHumeniuk/chess-frontend:latest`
- Labels:
  - `traefik.enable=true`
  - `traefik.http.routers.frontend.rule=Host('chess.phuman.com')`
  - `traefik.http.routers.frontend.entrypoints=websecure`
  - `traefik.http.routers.frontend.tls.certresolver=letsencrypt`
  - HTTP → HTTPS redirect middleware
- Restart: `always`

**backend**
- Image: `ghcr.io/PavelHumeniuk/chess-backend:latest`
- Labels:
  - `traefik.enable=true`
  - `traefik.http.routers.backend.rule=Host('chess.phuman.com') && PathPrefix('/api')`
  - `traefik.http.routers.backend.entrypoints=websecure`
  - `traefik.http.routers.backend.tls.certresolver=letsencrypt`
- Environment:
  - `NODE_ENV=production`
  - `PORT=3001`
- Restart: `always`

Volumes:
- `letsencrypt:` (named volume for Traefik SSL certs)

Networks:
- Single shared bridge network for all services

### 4. `.github/workflows/deploy.yml`

Trigger: push to `main` branch

Jobs:

**build-and-push**
- Runs on: `ubuntu-latest`
- Steps:
  1. Checkout repo
  2. Log in to `ghcr.io` using `GITHUB_TOKEN`
  3. Build and push `chess-frontend` image with tag `latest`
  4. Build and push `chess-backend` image with tag `latest`

**deploy**
- Depends on: `build-and-push`
- Runs on: `ubuntu-latest`
- Steps:
  1. SSH into VPS using secret `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
  2. On VPS run:
     ```bash
     docker compose pull
     docker compose up -d
     docker image prune -f
     ```

### 5. GitHub Actions Secrets to Configure

| Secret | Value |
|---|---|
| `VPS_HOST` | Your VPS IP address |
| `VPS_USER` | SSH user (e.g. `root` or `ubuntu`) |
| `VPS_SSH_KEY` | Private SSH key (the one whose public key is on the VPS) |

> `GITHUB_TOKEN` is automatic — no need to add it manually.

---

## What You Need to Do Manually (in order)

### Step 1 — GoDaddy: add DNS record

Go to GoDaddy → DNS Management → Add record:
```
Type:  A
Name:  chess
Value: YOUR_VPS_IP
TTL:   600
```
Wait 5–30 minutes for propagation.

### Step 2 — VPS: install Docker

SSH into your VPS and run:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Verify:
```bash
docker --version
docker compose version
```

### Step 3 — VPS: create app directory

```bash
mkdir -p ~/chess-app
cd ~/chess-app
```

Copy `docker-compose.yml` to this folder (or clone your repo here).

### Step 4 — GitHub: configure secrets

Go to your repo → Settings → Secrets and variables → Actions → add:
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

### Step 5 — GitHub: enable GitHub Container Registry

Go to your GitHub profile → Settings → Packages → make sure container visibility is set to **Public** (or configure pull credentials on VPS for private).

### Step 6 — First deploy

Push to `main` branch. GitHub Actions will:
1. Build both Docker images
2. Push them to `ghcr.io`
3. SSH into VPS and run `docker compose up -d`
4. Traefik will automatically request an SSL certificate from Let's Encrypt

### Step 7 — Verify

Open `https://chess.phuman.com` — the app should be live with a valid SSL cert.

---

## Every Future Deploy

Just push to `main`. GitHub Actions handles everything automatically.

```
git push origin main
# → builds images → pushes to ghcr.io → SSHes into VPS → docker compose up -d
```