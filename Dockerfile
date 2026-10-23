# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

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
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npx prisma db seed"]

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/cache-handlers ./cache-handlers
USER node
EXPOSE 3000
CMD ["node", "server.js"]
