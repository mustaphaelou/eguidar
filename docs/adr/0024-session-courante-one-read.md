# One Session courante module owns the Client and its role

The same session read was written four times. `sign-in-status.tsx:13` called `auth.api.getSession({ headers: await headers() })` raw; `getSessionUser()` (`lib/use-cases/get-session.ts:9-12`) wrapped it to answer the user; `getAdminSession()` (`lib/use-cases/get-admin-session.ts:8-12`) wrapped it again to answer a session only when the role was `admin`; and `admin-gate.ts` owned the role vocabulary — `isAdminRole` plus a `requireAdminRole` and an `AdminGateError` that **no production file ever called**, kept alive by two suites, one of which opened two real database transactions to prove a dead export. A refusal lived in `requireSessionUser` (`get-session.ts:14-18`), also without a production caller. Eleven production files imported one of the three modules and twelve test files mocked one of them — sixteen `vi.mock` calls, four files mocking two modules each — so every consumer paid the tax of knowing which spelling it wanted.

## Decision

- **One module owns the read.** `lireSession()` answers the Client of the request, or `null`. It is the only place `auth.api.getSession` is called for a server render or action.
- **The module owns the Client's type.** `Client` is `{ id, name, email, role: Role }`, with `Role` a union (`"user" | "admin"`) rather than the plain `String` the schema carries (`prisma/schema.prisma:21`). `mutation-actions.ts:31`'s `SessionUser`, derived from a function's return type, is retired in its favour.
- **The module owns the role vocabulary.** `estAdmin(client)` sits beside the type, so no surface writes `client?.role === "admin"`.
- **The read does not refuse.** The refusal stays one call away in the existing `loginUrl(destination)` (`lib/lien-de-connexion.ts:38`), composed by the surface that requires it: the admin layout, the action shell, or the page that demands a Client. The header needs a `null` answer, not a redirect, and `proxy.ts:25` keeps its deliberate edge-safe `getSessionCookie` presence check — a cookie check at the edge is not a session read, and never becomes one.
- **The dead gate is deleted, and the two wrappers with it.** `lib/use-cases/admin-gate.ts`, `admin-gate.test.ts` and `admin-gate.integration.test.ts` go, as do `get-session.ts` and `get-admin-session.ts`: the sixteen `vi.mock` paths move onto the new module in the same change, so one path remains.
- **No new term for the role.** The glossary already names **Administration** and **Compte client**; only **Session courante** is added (`GLOSSARY.md`).

## Considered Options

- **Read-and-refuse in the module** (a required-session helper that redirects) — rejected: it asks a module the header imports to own a redirect policy, and duplicates what `loginUrl` already owns. The review that prompted this proposed it; the header's need for a null answer is the counter-example.
- **Keep `admin-gate.ts` as the role module** — rejected: identity reading and its role vocabulary would stay split, and the module's only production importer is the session read it belongs beside.
- **Fold the role in but keep the integration suite** — rejected: two database round-trips existed to prove `isAdminRole` over a live row; the predicate is a pure function of a typed field and needs no database.

## Invariants

- Exactly one module reads the session for a server render or action; no surface calls `auth.api.getSession` itself. The one exception is the Better Auth handler's own endpoint (`app/api/auth/[...all]/route.ts:46`), which re-reads the session it has just issued to replay the Panier Visiteur after sign-in: it is not a render or an action, no surface consumes the Client it would answer, and it belongs to the authentication mechanism this ADR leaves alone.
- `proxy.ts` never performs a session read at the edge.
- A surface that demands a Client composes the refusal from `loginUrl`; the read itself never redirects.
- A missing session and a non-admin session stay distinguishable: an absent Client is `null`, a present one carries its `Role`.

## Amendement — La durée absolue termine la session, et la lecture s'en assure (#835)

`expiresIn`/`updateAge` ne connaissent que l'inactivité : une session qui reste
active repoussait `expiresAt` indéfiniment, et un cookie volé chez un Client qui
continue de naviguer ne mourait jamais. ASVS 7.3.2 demande une durée maximale
absolue, distincte de la fenêtre d'inactivité.

**Deux constantes nommées portent la borne.** `lib/session-constants.ts` gagne
`SESSION_ABSOLUTE_CLIENT_SECONDS` (30 jours) et
`SESSION_ABSOLUTE_ADMIN_SECONDS` (24 heures), à côté de la paire d'inactivité.
Elles reprennent les plafonds NIST AAL1 et AAL2 ; une session d'Administration —
le rôle `admin`, quelle que soit la page qu'il consulte — prend la plus courte.
L'âge se mesure depuis `session.createdAt`, que l'activité ne rafraîchit pas, et
non depuis `expiresAt`, que `updateAge` fait glisser.

**La borne termine la session, elle ne la masque pas.** `lib/session-expiration.ts`
porte le prédicat et le geste : une session qui atteint sa borne est supprimée
(`prisma.session.deleteMany` sur son jeton). `lireSession()` l'applique — c'est le
seul propriétaire de la Session courante pour les rendus et les actions — et le
gestionnaire `/api/auth/*` fait de même avant de traiter une requête portant un
cookie de session. Le cookie volé cesse donc d'authentifier les endpoints
d'authentification eux-mêmes, et non seulement les pages : la prochaine lecture,
côté serveur ou via `useSession`, trouve une session absente et le navigateur
retombe sur l'état Visiteur. Il n'y a pas de notice dédiée : la fin se présente
comme une session absente, et la Connexion reste possible.

**Le crochet client n'est pas une seconde lecture de Session courante.**
`useSession()` (`better-auth/react`) interroge `/api/auth/get-session` ; il ne
lit pas `lireSession()`. Il ne peut donc pas porter la décision, et c'est le
gestionnaire de route qui purge la session avant que `useSession()` ne reçoive
sa réponse. `proxy.ts` garde son contrôle de présence de cookie : ce n'est pas une
lecture de session, et il ne borne rien.

**La fenêtre d'inactivité de 30 minutes ne change pas.** Les deux fins sont
indépendantes : une session peut mourir d'inactivité bien avant sa borne absolue,
et une session active meurt quand même à la borne. Le glossaire nomme désormais
les deux termes séparément (Session inactive, Session hors durée absolue).

## Invariants

- Une session dont `createdAt` a atteint la borne de son rôle ne rend jamais de
  Client par `lireSession()`, et sa ligne est supprimée.
- Une requête portant un cookie dont la session a atteint la borne est traitée
  comme non authentifiée par `/api/auth/*` : la ligne est supprimée avant le
  gestionnaire, et `get-session` répond `null`.
- `SESSION_ABSOLUTE_ADMIN_SECONDS < SESSION_ABSOLUTE_CLIENT_SECONDS`, et les deux
  sont plus grandes que `SESSION_INACTIVE_SECONDS`.
- Les deux bornes sont des constantes nommées ; aucune branche de rôle ne cache
  un nombre dans la lecture.
- `proxy.ts` ne lit toujours pas la session et ne borne rien.
