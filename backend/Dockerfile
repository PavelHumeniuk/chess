FROM node:20-slim

# Install Stockfish
RUN apt-get update && \
    apt-get install -y stockfish && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3001
ENV STOCKFISH_PATH=/usr/games/stockfish
ENV PATH="/usr/games:${PATH}"

EXPOSE 3001

CMD ["node", "index.js"]
