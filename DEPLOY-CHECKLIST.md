# 🚀 Quick Deploy Checklist

Follow these 5 steps to get your Chess app live on `chess.phuman.com`.

### 1. SSH into VPS
Run this command from your terminal:
```bash
ssh root@YOUR_VPS_IP
```
_Note: If you use a different user (like `ubuntu`), replace `root` with that username._

### 2. DNS (GoDaddy)
- Go to GoDaddy DNS for `phuman.com`.
- Add **A Record**:
  - Name: `chess`
  - Value: `YOUR_VPS_IP`
  - TTL: `600`

### 2. VPS Setup (Hetzner)
SSH into your server and run:
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Create App Folder
mkdir -p ~/chess-app
cd ~/chess-app
```

### 3. VPS Configuration
Create a `.env` file in `~/chess-app/` on the server:
```bash
nano ~/chess-app/.env
```
Paste this (and edit):
```env
LETSENCRYPT_EMAIL=phuman911@gmail.com
GITHUB_USERNAME=PavelHumeniuk
DOMAIN=chess.phuman.com
```

### 4. GitHub Secrets
Go to your **GitHub Repo > Settings > Secrets > Actions** and add:
- `VPS_HOST`: Your VPS IP.
- `VPS_USER`: `root` (or your sudo user).
- `VPS_SSH_KEY`: Your private SSH key (the one you created earlier).

### 5. Launch
1. Copy `docker-compose.yml` from your repo to `~/chess-app/` on the VPS.
2. Push any change to your `main` branch.
3. Check the **Actions** tab on GitHub to watch it deploy!

---
**Need help?** All details are in [DEPLOY.md](file:///Users/pavelhumeniuk/src/chess/DEPLOY.md).
