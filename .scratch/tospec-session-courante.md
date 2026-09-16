## Problem Statement

The same session read is written four times. Two modules each wrap the authentication call to answer a slightly different slice, the header reads the session raw, and a third file owns the role vocabulary with two exported helpers that **no production file ever calls** — one of which is kept alive only by a suite that opens two real database transactions to prove it. A refusal helper sits beside them with no caller either. Eleven production files import one of the three module paths and twelve test files mock one of them, sixteen mock calls in total, so every consumer carries the knowledge of which spelling it needs and every suite stubs that spelling separately.

## Solution

One Session courante module reads the session once and answers the Client — identity and role — or nothing. It owns the role vocabulary, including the predicate that says whether a Client is an administrator. The refusal stays with the surface that demands it, and the edge proxy keeps its deliberate cookie check. The dead gate and its two suites are deleted, and the module paths the suites already mock become one.

## User Stories

1. As a storefront developer, I want one function that answers the Client of the request, so that no surface reads the session itself.
2. As a storefront developer, I want the Client's type to live beside the read that produces it, so that it is declared once instead of derived from a function's return type.
3. As a storefront developer, I want the role to be a union rather than a string, so that a typo in a role comparison cannot compile.
4. As a storefront developer, I want one predicate that says whether a Client is an administrator, so that no surface writes the comparison itself.
5. As a storefront developer, I want one module to stub in tests, so that a suite mocks one path instead of choosing among three.
6. As a future coding agent, I want the read and the refusal separated, so that a surface needing a null answer is not forced into a redirect policy.
7. As a future coding agent, I want the two dead exports and their suites deleted, so that no test exists to prove behaviour no caller depends on.
8. As the maintainer, I want a database-backed suite for a pure predicate deleted, so that the test run stops paying for a decision it cannot fail.
9. As a Visiteur, I want the header to show the connexion state correctly, whether or not I am authenticated.
10. As a Visiteur, I want an administrator-only route to keep refusing me and sending me to the Connexion modal, exactly as it does today.
11. As a Visiteur, I want a protected mutation attempted without a session to keep refusing the way it does today, so that a refactor changes nothing about what I see.
12. As a Visiteur, I want the edge proxy to keep redirecting me before any page renders, so that an unauthenticated request never reaches a protected page.
13. As a Client, I want my name to keep appearing on the header control, so that the read carries the identity facts the header uses.
14. As an administrator, I want the Administration layout to keep requiring my role, so that a signed-in non-administrator still cannot enter.
15. As a future coding agent, I want the two upload routes and the action shell to resolve the role through the same module, so that the administrator check has one implementation.
16. As a future coding agent, I want the thin compatibility re-exports removed once consumers move, so that one path remains.
17. As the maintainer, I want the thirteen production import sites updated in one change, so that no consumer is left on the old spelling.

## Implementation Decisions

- **One new module owns the read and the Client.** It answers the Client — `{ id, name, email, role }` — or `null`, and it is the only place the authentication call is made for a server render or action. It is server-only.
- **The role is a union and the predicate sits beside it.** `estAdmin(client)` is exported from the same module as the Client's type; the type currently exported as a derived alias is retired in favour of the module's own.
- **The read does not refuse.** The refusal is composed by the surface that requires it, from the existing login-link builder. This is deliberate: the header needs `null`, and a module the header imports should not own a redirect policy.
- **The edge proxy is untouched.** Its session-cookie presence check is not a session read and does not become one; the module never replaces it.
- **The dead gate is deleted**, with its unit suite and its database-backed integration suite. The surviving predicate moves into the new module.
- **One module path replaces three for test mocking.** Twelve suites mock a session module today across sixteen calls; they all point at the new module. The thin re-export modules survive so those suites' mock paths move mechanically, and they are deleted in the same change once consumers are updated.
- **The shared test mocks stay**, since they are already stubs of the module boundary rather than of the authentication layer.
- **A new suite asserts the module at its own interface**, mocking the authentication layer *beneath* it, which no suite does today.
- **No behaviour change** on any surface: the same visitors are refused in the same places, with the same destinations.

## Testing Decisions

Good tests here cross the module's interface: what a given authentication answer becomes. They stub the layer beneath the module, which is the opposite of what every consumer suite does and the reason this seam has a real test for the first time.

- **New suite for the module.** Cases: a session with a user answers that Client's identity facts; no session answers `null`; a non-administrator is not an administrator and an administrator is; the role travels as the typed union. Prior art is the existing session-reading suites, which stub the module *above*; this one stubs the authentication call below.
- **A guard that the module stays server-only**, matching the neutrality guards used elsewhere but in the opposite direction: this module must never enter a client bundle.
- **Behaviour locks that must pass untouched**, with only their mock path changed: the layout suite, the action-shell suite, the order-status action suite, the checkout and profile suites, the cart page and badge suites, the auth route suite, and the panier suite. Together they already prove refusal destinations, the unauthenticated outcome and the header's state.
- **Deleted tests:** the dead gate's unit suite and its database integration suite, which assert a predicate and a refusal that no production path uses.

## Out of Scope

- The refusal policy for a missing row — the « introuvable » behaviour across the Administration surfaces, which is a separate candidate with its own decisions.
- The mutation shell's mechanics: the action factories and their refusal callbacks are consumed here, not changed.
- Any change to the authentication mechanism, its providers or its session lifetime.
- The automatic session timeout and its notice.
- Which surfaces require an administrator, and what each does when refused.

## Further Notes

- Candidate 5 of the architecture review of 2026-09-15 (« One session courante module, and delete the dead gates »), rated *Worth exploring*.
- **The review's count is slightly off in a way worth recording:** it says twelve test files mock one of the three modules, which is right, but there are sixteen mock calls because four files mock two modules each. The duplication is worse than the file count suggests and the mechanical swap is smaller than it looks.
- **Deletion test.** Delete the new module and the four spellings return: two wrappers, a raw read in the header, and a role predicate stranded with the dead gate.
- Landing: one ticket, one PR to `main`, after the checkout is fast-forwarded to the current remote main. Sequenced before the shared mutation mechanism, whose consumers sit on this seam.
