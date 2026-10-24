# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Lint is not a deploy gate; types are still checked by next build and CI.
RUN npx next build --no-lint

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Bright Data cache (seed/raw/cache) and seed JSON are read at runtime from process.cwd()/seed.
COPY --from=build --chown=nextjs:nodejs /app/seed ./seed
RUN mkdir -p /app/public/uploads /app/seed/raw/cache && chown -R nextjs:nodejs /app/public/uploads /app/seed/raw/cache
USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
