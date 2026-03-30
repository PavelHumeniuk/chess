FROM node:20-slim

# Install Stockfish
RUN apt-get update && \
    apt-get install -y stockfish && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV STOCKFISH_PATH=/usr/games/stockfish
ENV PATH="/usr/games:${PATH}"

EXPOSE 3001

CMD ["node", "dist/index.js"]
