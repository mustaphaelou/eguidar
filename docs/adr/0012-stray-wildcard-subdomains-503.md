# Stray wildcard subdomains are left to answer the origin's 503

Any undeclared subdomain of `eguidar.com` (e.g. `ww.`, `shop.`, `app.`) resolves through the
proxied wildcard `*.eguidar.com` A record to the Coolify/Traefik origin, finds no Traefik router
for its `Host`, and gets a plain-text 503 `no available server`. We keep it this way
deliberately (#121): the 503s are cosmetic — nothing links to stray subdomains, and they leak
nothing, since no router and no service sits behind them. A broad host-matching redirect
(`http.host ne "eguidar.com"`) would catch `cdn.` (R2) and `ssh.` (Tunnel) along with the
strays. The apex stays the only host the origin serves (see « Hôte canonique » in `CONTEXT.md`);
`www.` redirects at the edge via `egd001_www_to_apex` (#120), and `cdn.`, `ssh.`, `send.` keep
their own records.

## Considered Options

- Accept the 503s (chosen) — zero edge config, zero risk; nothing links to stray subdomains.
- **Narrow per-host redirect rules** — mirrors the #120 fix, but only pays off for hosts people
  actually type, and `www.` — the one that exists — is already covered; rejected until a concrete
  typo host shows up.
- **Delete the wildcard record** — stray subdomains would stop resolving entirely, but `www.`
  has no DNS record of its own and depends on the wildcard to reach the redirect, and any Coolify
  service FQDN on this zone may silently rely on it; rejected pending a confirmed Coolify FQDN
  inventory.

Revisit if a Coolify service starts using a subdomain FQDN on this zone (give it an explicit
record), or if stray-host traffic ever becomes more than noise (then mirror `egd001_www_to_apex`
with a narrow per-host rule).
