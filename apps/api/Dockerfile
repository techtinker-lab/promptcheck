# ==============================================================================
# PromptCheck API — Production Dockerfile
# Multi-stage build for minimal image size and maximum security
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# Copy workspace manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile --filter "@promptcheck/shared" --filter "@promptcheck/api"

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared and api
RUN pnpm --filter "@promptcheck/shared" run build 2>/dev/null || true
RUN pnpm --filter "@promptcheck/api" run build

# ==============================================================================
# Runner Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0

# Security: run as non-root user
USER node

# Copy built bundle from builder
COPY --chown=node:node --from=builder /app/apps/api/dist/server.js ./dist/server.js

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3333/health || exit 1

CMD ["node", "dist/server.js"]
