# Deployment Guide

This guide explains how to deploy the Chess application on a Linux server (e.g., Hetzner, DigitalOcean, AWS).

## Prerequisites

1.  **Node.js**: Version 20 or higher.
2.  **Stockfish**: The chess engine must be installed and available in the system path.
3.  **Process Manager**: (Recommended) `pm2` to keep the server running.

---

## Option 1: Manual Deployment (Linux/Ubuntu)

### 1. Install System Dependencies
Run the provided script to install Stockfish:
```bash
chmod +x scripts/install-stockfish.sh
./scripts/install-stockfish.sh
```

### 2. Prepare the Application
```bash
# Install dependencies
npm install

# Build the frontend
npm run build
```

### 3. Configure Environment
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
Ensure `STOCKFISH_PATH` points to your stockfish binary (usually just `stockfish`).

### 4. Run with PM2
```bash
# Install PM2 globally if not already
npm install -g pm2

# Start the server
pm2 start server/index.js --name chess-app
```

---

## Option 2: Docker Deployment (Recommended)

The project includes a multi-stage `Dockerfile` that packages both the Node.js environment and the Stockfish engine.

### 1. Build and Run
```bash
# Build the image
docker build -t chess-app .

# Run the container
docker run -d -p 3001:3001 --name chess-instance chess-app
```

---

## GitHub Actions CI

A GitHub Action is configured in `.github/workflows/main.yml`. It automatically:
- Installs dependencies and Stockfish.
- Runs linter and tests.
- Builds the project.

### Suggested CD (Continuous Deployment)
To automate deployment to your server:
1.  Add a `DEPLOY_SSH_KEY` secret to your GitHub repository.
2.  Update the workflow to use `appleboy/ssh-action` to pull the latest code and restart the server/container on your Hetzner instance.

## Configuration & Secrets

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | The port the server listens on | `3001` |
| `STOCKFISH_PATH` | Path to Stockfish binary | `stockfish` |
| `NODE_ENV` | Environment mode | `development` |

> [!IMPORTANT]
> Ensure port `3001` (or your custom `PORT`) is open in your server's firewall.
