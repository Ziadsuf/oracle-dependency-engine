# Build stage: compile TypeScript, bundle frontend, prepare backend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json vite.config.ts ./
COPY src ./src
COPY server.ts ./

RUN npm ci

# Build frontend (Vite) and backend (esbuild)
RUN npm run build

# Runtime stage: minimal image with only production dependencies
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3010

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3010 || exit 1

CMD ["node", "dist/server.cjs"]
