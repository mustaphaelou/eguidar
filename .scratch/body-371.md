Part of #374.

## Problem Statement

The Recherche's filter panel is drawn from two independent reconstructions of the same three lists. The server answers counts plus a partial list shape, and the sidebar rebuilds every option client-side — its own map of counts, its own `fr` sort, its own copy of the rule that keeps an active filter visible at zero, and its own ordering of the Tranches de prix. Nothing checks that the two agree, and no test covers the sidebar at all, so a change to either copy is invisible until a Visiteur sees a wrong count or a filter that vanished. The list the Visiteur actually looks at is the one with no test.

## Solution

The Recherche answers the complete option list as pure data: every Option de filtre with its value, its display label, how many results it would give, and whether it is currently retained. One assembly, next to the facet queries that already produce the counts. The sidebar stops computing and becomes a renderer: it decides only what to show — hiding zero-count options that are not retained, and collapsing the brand list behind « voir tout ».

## User Stories

1. As a storefront developer, I want one function that turns facet distributions into filter options, so that no surface re-implements the counts, the labels or the sort.
2. As a storefront developer, I want the keep-an-active-filter-visible rule to have one owner, so that an active filter cannot disappear from one copy while surviving in the other.
3. As a storefront developer, I want the three filters to answer the same option shape, so that the sidebar handles one type instead of a union of three.
4. As a storefront developer, I want the shipped option list to be a value I can assert, so that the rules are testable without rendering a client component.
5. As a storefront developer, I want the module to be pure, so that proving the option rules needs neither a database nor a search engine.
6. As a storefront developer, I want a frontière guard on the module, so that a careless import can never pull an engine or the database into the browser bundle.
7. As a Visiteur, I want every brand, catégorie and Tranche de prix to show the count it would give under my current query, so that I can judge a filter before applying it.
8. As a Visiteur, I want the filter I just applied to stay visible even when its count drops to zero, so that I can always see and remove what is narrowing my results.
9. As a Visiteur, I want the displayed labels to be the same on every render, so that a catégorie never shows its raw slug in one place and its name in another.
10. As a Visiteur, I want the Tranches de prix in their fixed band order, so that the list reads the same way every time.
11. As a Visiteur, I want brands sorted the same way as catégories, so that the panel has one consistent reading order.
12. As a Visiteur, I want the brand list to stay compact until I ask for more, so that the panel does not push the results off the screen.
13. As a Visiteur, I want every option's label rendered from the data I was sent, so that nothing is formatted differently on the client than on the server.
14. As a future coding agent, I want the option assembly to sit beside the facet queries that feed it, so that a new facet has one obvious place to be added.
15. As a future coding agent, I want the sidebar to contain no rule about what an option means, so that I can change its markup without changing behaviour.
16. As a future coding agent, I want the zero-count rule stated once and pinned by a test, so that I never have to diff two implementations to learn it.
17. As the maintainer, I want the duplicate client-side assembly deleted rather than adapted, so that the next change to filtering touches one file.

## Implementation Decisions

- **One new pure module owns the option assembly**, neutral in the sense of the card and Devis seams: no `"use client"`, no database import, no `next/headers`, no `server-only`, no search-engine import. It is imported by the server search module and by the client sidebar, so a frontière guard locks its neutrality.
- **One option shape replaces three.** The Recherche's answer carries `{ value, label, count, selected }` for brands, catégories and Tranches de prix alike. The Tranche de prix's current identifier field is folded into `value`, so a bucket's identity has one name.
- **The module's input is facts, not dependencies.** It takes the three facet distributions, the active filter values, and an already-resolved label per value. The database lookup that turns catégorie slugs into names stays in the search module, which feeds the labels in — the module never queries.
- **The module orders.** Brands and catégories by their labels under the `fr` locale; Tranches de prix by their fixed band order, not by count. The sidebar preserves the received order and never re-sorts.
- **A retained value is always emitted, even at zero.** That is the rule the sidebar implements twice today; it becomes the module's stated rule, and the count simply tells the truth.
- **A value with no resolved label falls back to its own value**, which is what the client does today for an unknown catégorie slug.
- **Visibility stays with the sidebar.** Hiding zero-count options that are not retained, and collapsing brands behind « voir tout », depend on local UI state and remain display decisions. They are not part of the option list.
- **ADR-0016's count rule stays where ADR-0023 put it.** The pure function that strips a facet's own clause before its count query keeps its job above the search seam; this module owns the *presentation* consequence of that rule, not the query rule.
- **No behaviour change is intended for any surface**, except that the shipped list is now complete and ordered once.

## Testing Decisions

Good tests here cross the module's interface: given distributions, active values and labels, which options come out. They never assert private helpers, and they never render the sidebar to reach a rule.

- **New pure suite for the option module**, prior art the pure pure-function suites in this codebase — the listing module and the index projection both test a value in, a value out. Cases: counts pass through; brands and catégories sort under `fr`; Tranches de prix keep band order; a retained value with count zero is emitted; a non-retained value with count zero is emitted by the module and left for the sidebar to hide; an unresolvable label falls back to the value; `selected` reflects the active filters.
- **New frontière guard**, prior art the card and Devis guards and their shared helper: the module carries no `"use client"`, no `useState`, and imports no database, headers or engine module.
- **The sidebar gets no new test.** Its remaining job is visibility, which depends on local state; the rules that used to live there are now asserted at the module. A rendering test would pin markup, not behaviour.
- **Behaviour locks that must pass untouched:** the search suite's pure branches, and the facet-count assertions the Recherche seam work is moving onto CI.

## Out of Scope

- The search seam itself — the engine interface, its Meili adapter and the in-memory engine that puts the facet queries on CI. That work is specced separately and this module sits above it.
- ADR-0016's query rule: which clauses a facet's own count query drops.
- An exact result count instead of the engine's estimate.
- The suggestion dropdown's payload and its client component.
- Any change to how a filter is applied, combined or removed.

## Further Notes

- Candidate 4 of the architecture review of 2026-09-15 (« Assemble the facet options once »), rated *Worth exploring*.
- **The review undercounts the variation.** Its own note says the server already sorts and filters zero-counts, which is only true of the partial work it does; the sidebar's rebuild is the second implementation of the zero rule, and it additionally orders Tranches de prix by band order while the server orders them by minimum price. One module removes both disagreements.
- **Deletion test.** Deleting the option module would put the zero rule, two sorts and the label fallback back into the sidebar, where nothing asserts them — which is exactly today's state.
- Landing: one ticket, one PR to `main`, after the checkout is fast-forwarded to the current remote main.