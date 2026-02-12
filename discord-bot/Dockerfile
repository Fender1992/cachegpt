# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/

RUN yarn build

# ── Stage 2: Production ──────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Create non-root user
RUN groupadd -r botuser && useradd -r -g botuser botuser

# Copy package files and install production dependencies only
COPY package.json yarn.lock* ./
RUN yarn install --production --frozen-lockfile 2>/dev/null || yarn install --production

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R botuser:botuser /app

USER botuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "const http = require('http'); const port = process.env.PORT || process.env.INTERNAL_API_PORT || 3100; http.get('http://0.0.0.0:' + port + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start the bot
CMD ["node", "dist/index.js"]
