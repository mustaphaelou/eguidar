## Problem Statement

Three modules in this codebase each carry a rule that has been written twice, and in every case the copy nobody tests is the one a person actually sees.

The Recherche's filter panel is assembled twice — once on the server, once rebuilt in the sidebar — including two copies of the rule that keeps an active filter visible at zero, and two different orderings of the Tranches de prix. Nothing checks that the copies agree, and the sidebar has no test at all.

The session is read four times: two modules wrap the authentication call to answer slightly different slices, the header reads it raw, and a third file owns the role vocabulary with two exported helpers that no production file calls — one kept alive by a suite that opens two real database transactions to prove it. Twelve test files mock one of the three module paths across sixteen mock calls.

Four entity modules transcribe the same mutation scaffold: the best-effort boundary four times (one already drifted to a narrower signature), the validation-refusal construction seven times across six modules, thirteen effects-override merges, and three unique-violation ladders over one shared predicate.

Each is a missing module rather than a wrapper: deleting the duplicate does not remove the rule, it scatters it.

## Solution

Three deepenings, each a module that owns a rule currently held twice.

**Options de filtre.** The Recherche answers the complete option list as pure data — value, label, count, selected — assembled once beside the facet queries. The sidebar becomes a renderer that decides only what to show.

**Session courante.** One module reads the session once and answers the Client with its role. The refusal stays with the surface that demands it; the edge proxy keeps its cookie check; the dead gate and its two suites are deleted.

**Mutation squelette.** One module owns the mechanism — the best-effort boundary, the validation-refusal builder, the typed merge helper, the violation ladder and the shared contract assertions — while each entity module keeps its effects, its error classes and its invariants. The four contract suites stay four.

## User Stories

1. As a storefront developer, I want one owner for the filter option list, so that a count, a label or a sort order is decided once.
2. As a Visiteur, I want the filter counts and labels I see to come from one assembly, so that the panel cannot disagree with itself.
3. As a storefront developer, I want one module answering the Client and its role, so that no surface reads the session itself.
4. As an administrator, I want an administrator-only route to keep refusing me when it should, with nothing about the refusal changed.
5. As a storefront developer, I want the post-commit effect boundary written once, so that a retry or metrics policy lands in one place.
6. As an administrator, I want a committed mutation to stay committed when a notification or reindex fails, exactly as today.
7. As a future coding agent, I want each of these three rules to have one home, so that I never diff two implementations to learn it.
8. As the maintainer, I want no behaviour change to any surface, so that the three changes are reviewable as moves rather than redesigns.
9. As the maintainer, I want the decisions recorded as ADRs, so that the next architecture review does not re-find and re-propose them.

## Implementation Decisions

- **Three modules, three tickets, three PRs.** Each is independent at the code level: none of the three interfaces is a prerequisite for another.
- **The shared test seam is the module boundary.** The option module is proved as a pure value in, value out. The session module keeps the boundary twelve suites already mock, gaining one suite that stubs the authentication layer beneath it. The mechanism gains one suite that calls it with a fake effects bundle; the four entity suites keep their own invariants.
- **One prerequisite, not a ticket.** The implementer checkout is behind the remote main, which carries work these three are defined against. Fast-forwarding is implementation step zero and is proved by the existing suite, so it carries no test surface of its own.
- **Vocabulary follows the glossary.** The filter option list and the request's session both enter `GLOSSARY.md` as terms; the role does not, because the Administration already names it.
- **Two ADRs record the seams a future reader would question:** the session read that deliberately does not refuse, and the shared mutation mechanism that deliberately keeps four contract suites.
- **No schema change anywhere.** No queue, no outbox, no new dependency.

## Testing Decisions

Good tests cross a module's interface: what facts a set of inputs produces, what refusal a bad input yields, what a failed auxiliary effect does to its caller. None of the three tickets asserts a private helper, and none renders a component to reach a rule.

- **New pure suite** for the filter options, with the zero-count rule, both sort orders and the label fallback as cases; prior art is the existing pure-function suites in this codebase.
- **New suite** for the session module, stubbing the authentication layer beneath it — the opposite of what every consumer suite does today.
- **New suite** for the mutation mechanism, calling it directly with a fake effects bundle and no database fixture.
- **Two new frontière guards**, in the two directions that matter: the option module must stay client-safe, and the session module must never enter a client bundle.
- **Behaviour locks that must pass untouched:** the layout and action-shell suites, the checkout, profile, cart and badge suites, the auth route suite, the four entity mutation suites and their user-facing classification suites.
- **Deleted tests:** the dead gate's unit suite and its database-backed integration suite.

## Out of Scope

- The « introuvable » refusal policy — which outcome a missing row produces, and whether the two error hierarchies are reconciled. It stays exactly as it is, including the behaviour a test deliberately pins.
- The search engine seam, its Meili adapter and the in-memory engine that moves the facet suite onto CI. It is specced separately, and the option assembly sits above it.
- An exact result count instead of the engine's estimate, and surfacing a search outage to the Visiteur.
- Any retry, metrics or outbox policy for the best-effort boundary; this work only makes one place exist for it.
- Every rule the review noted as friction but did not card.

## Further Notes

- Candidates 4, 5 and 6 of the architecture review of 2026-09-15, the three rated *Worth exploring* that had no spec. The review's own top-three recommendation was already overtaken: its first candidate had shipped and its second was already specced as a separate ADR and ticket set.
- **The review is wrong in three places, and the tickets record the corrections rather than inheriting them.** It asks for one contract suite where the two search engines' ADR had rejected exactly that move six days earlier. It undercounts the session duplication at the file level while the mock call count is worse than it appears. And it treats the seven validation refusals as living in the four modules when only three do.
- **Deliberately unchanged:** the not-found classes that stay plain errors, the silent-void task refusal, and the order-status refusal redirect. Each is pinned by a test, and none of the three deepenings needs to touch it.
- **The pattern.** Every candidate here is a missing module, not a missing wrapper: the deletion test fails because the rule reappears elsewhere rather than disappearing. That is the property that justifies a seam rather than an extraction.
- Landing: one parent spec, three tickets, three PRs to `main`, after the checkout is fast-forwarded to the current remote main.

## Tickets

- [ ] the filter options are assembled once, and the sidebar renders them
- [ ] one Session courante module, and the dead gates are deleted
- [ ] one mutation mechanism behind four entity modules
