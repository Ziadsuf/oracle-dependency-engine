# syntax=docker/dockerfile:1

# ---- Build stage: compile the React SPA (Vite) and bundle the Node server (esbuild)
FROM node:20-alpine AS builder
WORKDIR /app

# Manifests first for better layer caching
COPY package*.json tsconfig.json vite.config.ts ./

RUN npm ci

# Sources needed by the build: index.html (Vite entry), src/ (SPA),
# server.ts + server/ (backend bundled by esbuild).
COPY index.html ./
COPY src ./src
COPY server.ts ./
COPY server ./server

# Produces dist/ (SPA assets + index.html) and dist/server.cjs (server bundle)
RUN npm run build

# ---- Runtime stage: minimal image with production deps only
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3010

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built artifacts
COPY --from=builder /app/dist ./dist
# Cypher templates are read from disk at runtime (server/graph/cypher/*.cypher
# via process.cwd()); the esbuild bundle does not inline them.
COPY --from=builder /app/server/graph/cypher ./server/graph/cypher

EXPOSE 3010

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3010/api/health || exit 1

CMD ["node", "dist/server.cjs"]
