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
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY . .
RUN npx prisma generate
RUN npm run build

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
EXPOSE 3000
CMD ["node", "server.js"]
