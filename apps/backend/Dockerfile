# ─── Stage 1: Install & Build ─────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Prisma engines require OpenSSL at build/runtime on many platforms.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Install all workspace deps (including devDeps needed for build)
RUN npm ci

# Copy source
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# 1. Build shared types
RUN npm run build --workspace=packages/shared

# 2. Generate Prisma client (must run inside the target OS so the binary matches)
RUN cd apps/backend && npx prisma generate

# 3. Compile TypeScript → dist/
RUN npm run build --workspace=apps/backend

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Only copy the built artefacts + the node_modules (symlinks intact)
COPY --from=builder /app/node_modules             ./node_modules
COPY --from=builder /app/packages/shared/dist     ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist        ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma      ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY package.json ./

WORKDIR /app/apps/backend

EXPOSE 4000

# Run migrations then start the server
# `prisma migrate deploy` applies pending migrations without interactive prompts
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/apps/backend/src/index.js"]
