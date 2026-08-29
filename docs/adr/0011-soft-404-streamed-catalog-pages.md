# Soft-404 (200 + noindex) accepted for streamed catalog pages

Unknown product and category slugs call `notFound()` inside a Suspense boundary, and with
`cacheComponents` every dynamic route streams a static shell first — so the HTTP status stays `200`
and Next.js injects `<meta name="robots" content="noindex">`. We deliberately keep this soft-404:
the only way to a real `404` status is an existence check in `proxy` (middleware) on every
`/produit/*` and `/categorie/*` request, and `noindex` already keeps these pages out of search
results. A styled `not-found.tsx` in `(boutique)` (plus a root one for unmatched URLs) covers the
user-facing side.

## Considered Options

- **Proxy existence check** — real `404` status, but adds a data lookup to every catalog request
  and a new architectural piece; rejected until there is a concrete analytics/monitoring need.
- **Never cache null fetch results** — fresher truth, but every bot junk-slug request would hit
  Postgres; rejected (nulls stay cached, invalidated via `PRODUCT_TAG`/`productDetailTag` on
  mutations, worst case one stale 404 view right after a product is created).
- **Redirect map for renamed/deleted products** — old slugs return a plain 404 instead; no 410
  Gone, no redirects.
