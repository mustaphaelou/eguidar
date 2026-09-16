Part of #374.

## Problem Statement

Four entity modules own genuinely different domain invariants, but each wraps them in the same scaffold, copied rather than shared. The best-effort boundary around post-commit effects exists in four versions and one has already drifted to a narrower signature. Seven validation-refusal classes re-spell the same message construction. Thirteen mutation entry points re-write the same effects override merge. Three of them re-write the same unique-violation ladder over one shared predicate. A retry policy, a metrics counter or a change to the boundary would have to be written four times, and the copies are already not identical.

## Solution

One skeletal module owns the mechanism: the best-effort boundary, the validation-refusal construction, the typed effects-override merge, the unique-violation ladder, and the assertions the four contract suites share. Each entity module keeps its own effects type, its default effects, its error classes and its own invariants — the mechanism learns no entity and no database term. The four suites stay four.

## User Stories

1. As a storefront developer, I want the post-commit best-effort boundary written once, so that a retry, a metric or a log policy lands in one place.
2. As a storefront developer, I want one validation-refusal builder, so that the message a refusal carries is constructed once.
3. As a storefront developer, I want each module to keep its own refusal class, so that catch blocks and suites keep keying on the names they use today.
4. As a storefront developer, I want one effects-override merge helper, so that the override contract is typed once instead of re-written per entry point.
5. As a storefront developer, I want the merge helper to preserve the current semantics exactly, so that an override wins per key and an omitted key keeps its production default.
6. As a storefront developer, I want the merge helper to land only where a merge already happens, so that mutations without an override parameter keep their signatures.
7. As a storefront developer, I want the unique-violation ladder in one shape, so that the third copy is not written a fourth time.
8. As a storefront developer, I want the database-aware violation check to stay where it is, so that the shared mechanism imports no database.
9. As a storefront developer, I want the four effects types and their production defaults to stay in their modules, so that the encapsulation decision is not undone.
10. As a storefront developer, I want the assertions the four suites share to live in one helper, so that the boundary and the refusal are proved once.
11. As a storefront developer, I want the four contract suites to stay separate, so that each module's own invariants keep a suite of their own.
12. As an administrator, I want a committed mutation to never be rolled back because a notification or a reindex failed, exactly as today.
13. As an administrator, I want a submission with invalid data to be refused with the same message it carries today.
14. As an administrator, I want task-action refusals to redirect exactly as they do today, so that this refactor changes no refusal's destination.
15. As an administrator, I want a duplicate SKU, slug or name to be reported as a conflict rather than as a validation error, exactly as today.
16. As a Client, I want a cancelled or returned Commande to keep returning its Variants to stock, so that the invariants survive the move.
17. As a future coding agent, I want the shared mechanism to know no entity name, so that adding a fifth module adds no branch to it.
18. As a future coding agent, I want the drift between the four boundary copies removed, so that I cannot pick the wrong signature.
19. As a future coding agent, I want the mechanism's own suite to call it directly, so that proving the boundary needs no entity fixture.
20. As the maintainer, I want a change to the boundary to touch one file, so that four modules stop being four places to be careful.
21. As the maintainer, I want no schema change and no queue or outbox, so that this stays a mechanical consolidation.

## Implementation Decisions

- **One new module owns the mechanism**, sitting beside the action shell in the use-case layer. It holds the best-effort boundary, the validation-refusal builder, the typed merge helper, the unique-violation ladder shape, and the shared contract assertions. It needs no server-only marker: it touches neither headers nor the database.
- **It learns no entity and no database.** The four effects types, their production defaults, the error classes and the Prisma-aware violation check all stay where they are. This is ADR-0014's encapsulation decision, untouched.
- **The validation-refusal builder does not own a shared error class.** It constructs the message; each module keeps its own class, so nothing that catches or asserts a class name changes. Three of the four modules use the pattern; the refusals outside them are left alone even where the string is identical.
- **The merge helper preserves the current semantics.** An override wins per key over the production default; an omitted key keeps the default. It is applied only at entry points that already merge — one of the four modules merges at two of its four exported functions and another at four of five, and those signatures do not change to accommodate the helper.
- **The ladder is shared; the predicate stays home.** The three ladders take one shape over the existing shared violation predicate.
- **The four contract suites stay four**, and only genuinely identical assertions move into the shared helper: the best-effort boundary and the validation refusal. The four modules' invariants — status transitions with restocking, acyclicity, uniqueness of SKU and slug, delivery-fee rules — are different enough that a merged suite would assert their intersection, which is weaker than four suites with distinct jobs.
- **The refusal mechanics are untouched**, per the existing decision that domain errors classify themselves and the shell's optional refusal redirect decides the outcome.
- **No schema change, no queue, no outbox.** The best-effort boundary keeps its warning-log behaviour.
- **An ADR records the mechanism and the rejected merge of the suites**, so the next architecture review does not re-propose it.

## Testing Decisions

Good tests here cross a module's interface: what facts a set of inputs produces, what refusal a bad input yields, and what a failed auxiliary effect does to the caller. They do not assert private helpers, and a new module's mechanism is proved by calling it, not by reaching through an entity.

- **New suite for the mechanism**, calling it directly with a fake effects bundle and a run that throws: a post-commit failure is logged and never thrown to the caller; a validation refusal carries the constructed message; the merge helper gives an override precedence per key and falls back to the default for an omitted key. No database fixture is needed for any of it.
- **The shared contract assertions become a helper the four suites call**, so the boundary and the refusal are proved once while each module keeps asserting its own invariants in its own suite.
- **Behaviour locks that must pass untouched:** the four existing user-facing classification suites, the four entity mutation suites, and the action-shell suite that already pins the silent-void default and the refusal redirect.
- **Explicitly unchanged and therefore not re-tested:** the two not-found classes that stay plain errors, and the order-status refusal redirect.

## Out of Scope

- The « introuvable » refusal policy: which outcome a missing row produces, and whether the two error hierarchies are reconciled. That is a separate candidate with its own decision, and the classes that carry it keep their current bases here.
- The refusal destinations and the shell's factory mechanics.
- Any retry, metrics or outbox policy for the best-effort boundary — this ticket only makes one place exist for it.
- The four validation refusals outside the four entity modules, and the modules without an effects seam.
- Moving the database-aware unique-violation predicate into the shared mechanism.

## Further Notes

- Candidate 6 of the architecture review of 2026-09-15 (« One mutation skeleton behind four entity modules »), rated *Worth exploring*.
- **The review asks for « one contract suite instead of four », and this spec deliberately refuses it.** The review of the two search engines rejected the same move six days earlier on the same reasoning: the modules differ, so a shared contract is their intersection. Recording the refusal is the point — otherwise the next review re-proposes it.
- **Two counts in the review are loose.** The seven validation refusals span six modules, not four — only three sit inside the modules this ticket touches. And the thirteen merge sites do cover every entry point that merges, but not every exported function.
- **Deletion test.** Delete the mechanism module and four boundary copies return, one of them with a narrower signature, plus thirteen merges and three ladders — which is today's state.
- Landing: one ticket, one PR to `main`, after the checkout is fast-forwarded to the current remote main and after the session seam lands, whose consumers this work sits on.