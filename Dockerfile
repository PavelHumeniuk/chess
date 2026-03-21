# Use Node 20 as base
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy everything
COPY . .

# Build the frontend
RUN npm run build


# Production stage
FROM node:20-slim

# Install Stockfish
RUN apt-get update && \
    apt-get install -y stockfish && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built assets and server from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Set environment
ENV NODE_ENV=production
ENV PORT=3001
ENV STOCKFISH_PATH=stockfish

EXPOSE 3001

# Start the server
CMD ["node", "server/index.js"]
