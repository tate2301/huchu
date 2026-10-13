# The workers' image for Fly.io (fly.toml). Workers run TypeScript through tsx
# and need the Prisma client, not the Next.js build, so there is no `next build`.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN node scripts/prisma-generate-if-changed.mjs

ENV NODE_ENV=production
