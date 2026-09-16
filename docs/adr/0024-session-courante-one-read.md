# One Session courante module owns the Client and its role

The same session read was written four times. `sign-in-status.tsx:13` called `auth.api.getSession({ headers: await headers() })` raw; `getSessionUser()` (`lib/use-cases/get-session.ts:9-12`) wrapped it to answer the user; `getAdminSession()` (`lib/use-cases/get-admin-session.ts:8-12`) wrapped it again to answer a session only when the role was `admin`; and `admin-gate.ts` owned the role vocabulary — `isAdminRole` plus a `requireAdminRole` and an `AdminGateError` that **no production file ever called**, kept alive by two suites, one of which opened two real database transactions to prove a dead export. A refusal lived in `requireSessionUser` (`get-session.ts:14-18`), also without a production caller. Eleven production files imported one of the three modules and twelve test files mocked one of them — sixteen `vi.mock` calls, four files mocking two modules each — so every consumer paid the tax of knowing which spelling it wanted.

## Decision

- **One module owns the read.** `lireSession()` answers the Client of the request, or `null`. It is the only place `auth.api.getSession` is called for a server render or action.
- **The module owns the Client's type.** `Client` is `{ id, name, email, role: Role }`, with `Role` a union (`"user" | "admin"`) rather than the plain `String` the schema carries (`prisma/schema.prisma:21`). `mutation-actions.ts:31`'s `SessionUser`, derived from a function's return type, is retired in its favour.
- **The module owns the role vocabulary.** `estAdmin(client)` sits beside the type, so no surface writes `client?.role === "admin"`.
- **The read does not refuse.** The refusal stays one call away in the existing `loginUrl(destination)` (`lib/lien-de-connexion.ts:38`), composed by the surface that requires it: the admin layout, the action shell, or the page that demands a Client. The header needs a `null` answer, not a redirect, and `proxy.ts:25` keeps its deliberate edge-safe `getSessionCookie` presence check — a cookie check at the edge is not a session read, and never becomes one.
- **The dead gate is deleted.** `lib/use-cases/admin-gate.ts`, `admin-gate.test.ts` and `admin-gate.integration.test.ts` go. `get-session.ts` and `get-admin-session.ts` survive as thin re-exports so the sixteen `vi.mock` paths move mechanically.
- **No new term for the role.** The glossary already names **Administration** and **Compte client**; only **Session courante** is added (`CONTEXT.md`).

## Considered Options

- **Read-and-refuse in the module** (a required-session helper that redirects) — rejected: it asks a module the header imports to own a redirect policy, and duplicates what `loginUrl` already owns. The review that prompted this proposed it; the header's need for a null answer is the counter-example.
- **Keep `admin-gate.ts` as the role module** — rejected: identity reading and its role vocabulary would stay split, and the module's only production importer is the session read it belongs beside.
- **Fold the role in but keep the integration suite** — rejected: two database round-trips existed to prove `isAdminRole` over a live row; the predicate is a pure function of a typed field and needs no database.

## Invariants

- Exactly one module reads the session; no surface calls `auth.api.getSession` itself.
- `proxy.ts` never performs a session read at the edge.
- A surface that demands a Client composes the refusal from `loginUrl`; the read itself never redirects.
- A missing session and a non-admin session stay distinguishable: an absent Client is `null`, a present one carries its `Role`.
