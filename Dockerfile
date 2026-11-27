# syntax=docker/dockerfile:1

FROM node:26-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# L'image amont fige les paquets Alpine de sa publication : `apk upgrade` prend
# les correctifs de sécurité sortis depuis, et la construction suivante les
# prendra encore. Sans lui, `libssl3` et `zlib` restent ceux du jour du tag.
RUN apk upgrade --no-cache

FROM base AS deps
COPY package.json package-lock.json ./
# `braces` is a `file:vendor/braces` dependency, so `npm ci` reads this
# directory before `COPY . .` ever runs. Copying it here keeps the install cache
# keyed on the lockfile and the vendored copy, and nothing else.
COPY vendor ./vendor
RUN npm ci

FROM deps AS builder
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
COPY . .
RUN npx prisma generate
# Le catalogue est lu au build, mais son URL reste un secret de BuildKit :
# montée pour ce RUN seulement, elle n'apparaît ni dans `docker history` ni
# dans une couche. Sans secret, le preflight de `npm run build` nomme le
# catalogue et arrête le build ; il ne prérend jamais une base factice.
RUN --mount=type=secret,id=database_url,env=DATABASE_URL npm run build

FROM deps AS migrate
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY . .
# Le socle du seed est compilé ici, où la chaîne TypeScript existe encore, puis
# les dépendances de développement quittent l'image : ni le `tsc` natif ni
# l'`esbuild` de `tsx` — deux binaires Go — ne partent au déploiement, et le
# seed compilé ne réclame que les dépendances de production.
RUN npx prisma generate \
 && npx esbuild prisma/seed.ts --bundle --platform=node --format=esm --packages=external --outfile=prisma/seed.mjs \
 && npm prune --omit=dev \
 && npm install --global npm@12.2.3
ENV PRISMA_SEED_COMMAND="node prisma/seed.mjs"
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npx prisma db seed"]

FROM base AS executant
# `npm` et `corepack` traînent leurs propres dépendances, que le scan d'images
# relève à chaque déploiement : le serveur standalone n'en a aucun usage.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

FROM executant AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/cache-handlers ./cache-handlers
USER node
EXPOSE 3000
CMD ["node", "server.js"]
