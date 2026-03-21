# Advanced Deployment Guide (Traefik + Docker Compose)

This project is now structured as a monorepo with separate `frontend` and `backend` services, orchestrated by Traefik for SSL and routing.

## Architecture

- **Frontend**: React served by Nginx (Port 80 internally).
- **Backend**: Node.js + Stockfish (Port 3001 internally).
- **Reverse Proxy**: Traefik (Ports 80/443 externally).

---

## 1. DNS Setup (GoDaddy)
Add an `A` record for your subdomain (e.g., `chess`):
- **Type**: `A`
- **Name**: `chess`
- **Value**: Your Virtual Private Server (VPS) IP.
- **TTL**: `600` (or default).

## 2. VPS Preparation

### 1. SSH into your VPS
To connect to your server, run:
```bash
ssh root@YOUR_VPS_IP
```

### 2. Add your SSH Key to the VPS
If you already created an SSH key on your Mac, you must add it to the server so GitHub Actions can deploy:
```bash
# Run this on your MAC (replaces YOUR_VPS_IP with the real IP)
ssh-copy-id root@YOUR_VPS_IP
```

### 3. Install Docker
Once logged into your VPS, run:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Create the application directory:
```bash
mkdir -p ~/chess-app
cd ~/chess-app
```

## 3. Configuration
Create a `.env` file on your VPS:
```env
LETSENCRYPT_EMAIL=your-email@example.com
GITHUB_USERNAME=your-github-username
DOMAIN=chess.yourdomain.com
```

## 4. CI/CD Setup (GitHub Actions)
Add the following Secrets to your GitHub Repository (**Settings > Secrets and variables > Actions**):

| Secret | Description |
| :--- | :--- |
| `VPS_HOST` | Your VPS IP Address. |
| `VPS_USER` | SSH Username (e.g., `root`). |
| `VPS_SSH_KEY` | Your private SSH key (must correspond to `~/.ssh/authorized_keys` on VPS). |

## 5. First Deployment
1. Copy the root `docker-compose.yml` to `~/chess-app/docker-compose.yml` on your VPS.
2. Push your code to the `main` branch.
3. GitHub Actions will:
   - Build and push Docker images to **GitHub Container Registry (GHCR)**.
   - SSH into your VPS and pull the latest images.
   - Run `docker compose up -d`.
   - Traefik will automatically provision an SSL certificate via Let's Encrypt.

---

## Local Development
Since the project is now split, you can run them separately:

**Backend**:
```bash
cd backend
npm install
npm run dev
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```
Vite will proxy requests to `http://localhost:3001` if configured (check `vite.config.ts`).
