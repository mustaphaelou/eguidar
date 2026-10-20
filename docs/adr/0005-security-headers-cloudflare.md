# Security headers served via Cloudflare, not the app

The site had no security headers at all (no HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP). We set them with a single zone-wide Cloudflare response-header transform rule on the `eguidar.com` Free-plan zone (`Strict-Transport-Security: max-age=31536000; includeSubDomains` without `preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`), plus Always Use HTTPS at the edge. The app itself (`next.config.ts`, `proxy.ts`) stays untouched — so future readers should know headers live in the Cloudflare dashboard/API, not the repo.

CSP is deliberately deferred: a strict nonce-based CSP requires the nonce flow in `proxy.ts` and dynamic rendering of all pages, which conflicts with the app's `cacheComponents`/PPR mode (and would need nonce support in `next-themes`/`next/font` inline content); Next 16 removed `experimental.strictCsp`. A CSP with `unsafe-inline` from the edge would be mostly theater, so it's a separate, future decision.

## Amendement — Les en-têtes partent aussi de l'application, la CSP n'est plus différée (#666)

Le premier paragraphe est périmé sur un point : les en-têtes ne vivent plus
seulement dans Cloudflare. `next.config.ts` porte désormais un bloc
`headers()` qui couvre toutes les routes et envoie
`Content-Security-Policy`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff` et
`Referrer-Policy: strict-origin-when-cross-origin`. HSTS reste au bord, qui
termine le TLS : l'application ne l'envoie pas, et
`next-config.headers.test.ts` épingle cette absence. La règle de réponse
Cloudflare peut rester en place — la duplication est sans danger et sert de
défense en profondeur — mais la configuration du site est la source de
vérité ; une CSP ajoutée un jour au bord devrait reprendre exactement la
valeur de l'application, sous peine de la remplacer.

La CSP n'est plus différée, mais elle n'utilise toujours pas de nonce, et
pour la raison déjà consignée : le flux de nonce exige le rendu dynamique de
toutes les pages, ce que `cacheComponents`/PPR interdit. La politique est
donc statique et concède `'unsafe-inline'` aux scripts et aux styles. Ce
n'est pas l'idéal — un script injecté s'exécuterait — mais la CSP garde ce
qui reste tenable sans renoncer au rendu incrémental : aucune origine de
script tierce hors Test de sécurité, aucune connexion tierce hors les deux
nommées, pas de cadre, pas de plugin, pas de base détournée, pas de
formulaire externe, pas d'image hors du CDN. Passer aux nonces reste une
décision séparée, à prendre si l'on accepte de rendre tout le site
dynamique.

Les sources élargies au-delà des directives du ticket, chacune nommée :

- `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com` —
  `'unsafe-inline'` est requis par les scripts d'amorçage que React/Next
  écrivent en ligne (`self.__next_f.push`, données Flight) et par le script
  de thème que `next-themes` injecte avant le premier rendu ; aucun nonce ne
  peut les couvrir sans le rendu dynamique refusé ci-dessus.
  `https://challenges.cloudflare.com` charge `api.js` du Test de sécurité.
  `'unsafe-eval'` n'apparaît qu'en développement, où React s'en sert pour
  reconstruire ses piles d'erreur ; la politique de production est épinglée
  sans lui.
- `frame-src https://challenges.cloudflare.com` et
  `connect-src https://challenges.cloudflare.com` — le widget Turnstile rend
  une iframe et rappelle son origine en réseau.
- `style-src 'self' 'unsafe-inline'` — des attributs `style` sont rendus dans
  le HTML (Sidebar, en-tête d'administration, indentation de l'arbre des
  catégories), et `next-themes` pose une feuille en ligne ; les feuilles
  Tailwind restent servies depuis `'self'`.
- `img-src 'self' https://cdn.eguidar.com` — le ticket l'exige ; en pratique
  `next/image` sert ses optimisations depuis `'self'`, et le CDN est déjà le
  seul `remotePatterns` accepté.
- `font-src 'self'` — `next/font` auto-héberge Geist Mono sous
  `/_next/static/media`.
- `connect-src … https://*.r2.cloudflarestorage.com` — l'envoi d'une Image
  produit depuis l'administration fait un `PUT` direct vers l'URL présignée
  R2, dont l'hôte est `https://<compte>.r2.cloudflarestorage.com` ; le
  numéro de compte n'est pas connu au build de l'image, d'où le joker. Sans
  lui, le téléversement des Brouillons casserait sans bruit. Un proxy
  same-origin reste la façon de refermer cette source plus tard.

`next-config.headers.test.ts` compare la politique directive par directive :
tout élargissement futur devra modifier ce test exprès.
