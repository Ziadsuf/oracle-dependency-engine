# syntax=docker/dockerfile:1

# ---- Build stage: compile the React SPA (Vite) and bundle the Node server (esbuild)
FROM node:26-alpine AS builder
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
FROM node:26-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3010

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built artifacts (owned by the unprivileged `node` user that runs the app)
COPY --from=builder --chown=node:node /app/dist ./dist
# Cypher templates are read from disk at runtime (server/graph/cypher/*.cypher
# via process.cwd()); the esbuild bundle does not inline them.
COPY --from=builder --chown=node:node /app/server/graph/cypher ./server/graph/cypher

# Drop root — run as the built-in unprivileged `node` user (uid 1000).
# PORT 3010 (>1024) needs no elevated privileges to bind.
USER node

EXPOSE 3010

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3010/api/health || exit 1

CMD ["node", "dist/server.cjs"]
