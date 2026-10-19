# ==============================================================================
# PromptCheck Web — Production Dockerfile
# Multi-stage build: compiles React/Vite app and serves with Nginx Alpine
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# Copy workspace manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile --filter "@promptcheck/shared" --filter "@promptcheck/web"

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared and web
RUN pnpm --filter "@promptcheck/web" run build

# ==============================================================================
# Runner Stage (Nginx Alpine)
# ==============================================================================
FROM nginx:1.27-alpine AS runner

# Copy custom Nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
