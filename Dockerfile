# syntax=docker/dockerfile:1
# Multi-stage build: compile TypeScript in a builder stage, copy only the
# runtime artifacts into a slim final image. Same image runs both the
# HTTP server (default CMD) and the wallet-push worker (override CMD).

ARG NODE_VERSION=20.18-alpine

# ---- Builder ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Install deps with cache-friendly ordering: lockfile first.
COPY package.json package-lock.json ./
RUN npm ci

# Now copy source and build.
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
COPY assets ./assets

RUN npx prisma generate \
  && npm run build

# ---- Runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Install only production deps for a smaller final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
CMD ["node", "dist/server.js"]
