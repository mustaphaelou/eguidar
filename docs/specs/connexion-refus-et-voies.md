# Connexion refusals and pathways

> Spec written 2026-11-16; its decisions are ADR-0058, ADR-0059 and ADR-0060.

## Problem Statement

The shop writes and reads in French, and its authentication speaks French everywhere except where it
fails. Three **Refus d'authentification** fall through to the library's English sentence: a
compromised password, the request limiter's refusal, and the fail-closed **Test de sécurité**. Five
more things are wrong in the same subsystem:

- The installed Better Auth is 1.7.18 while the lockfile pins 1.7.22, so no test exercises the
  version the build installs, and the shipped write path of `verification` cannot be inspected.
- A refused **Test de sécurité** does not renew its jeton, so the Client retries into a refusal it
  cannot clear — the trap `GLOSSARY.md` forbids under **Envoi protégé**.
- The client address has two rules. The shop's resolver keeps the last `x-forwarded-for` relay; the
  library keeps the first untrusted one. The two disagree exactly when `cf-connecting-ip` and
  `x-real-ip` are absent — the case the **Test de sécurité** `remoteip` and the Recherche limiter
  live in.
- `docs/auth-pathways.md` declares five controls absent that the code holds, and no index names the
  file, so nobody noticed.
- Three reasons that only ever lived in code comments are about to be deleted by the no-comments
  migration: the cost of rotating `BETTER_AUTH_SECRET` on provider jetons, the full declaration of
  the Google scopes, and the coupling of the code lifetime to the letter.

## Solution

Close the five defects, and make the record true again. The refusals gain one owner that cannot fall
through to English. The address rule becomes one rule. The **Test de sécurité** renews its jeton when
and only when it has spent it. A test makes the installed version match the lockfile. The pathways
statement is re-trued, indexed, and reachable from `docs/ARCHITECTURE.md`, and the three orphaned
reasons land in an ADR instead of dying with their comments.

Nothing changes for the Client except the words read on failure, and one fewer dead end.

## User Stories

1. As a Client whose new password is in a breach list, I want a French sentence that tells me to
   choose another password, so that I can act without decoding an English message.
2. As a Client who retries **Connexion** too quickly, I want the French "too many attempts" sentence,
   so that I understand the wait is deliberate and not a fault of mine.
3. As a Client whose **Test de sécurité** fails because the provider is unreachable, I want the
   widget to renew, so that my next attempt is not refused for a jeton I already spent.
4. As a Client who mistypes the mailed code, I want the **Test de sécurité** to *not* renew, so that
   an ordinary typing mistake costs me no extra challenge.
5. As a maintainer, I want a refusal code to require a French sentence at compile time, so that the
   next code added somewhere else cannot reach the Client in English.
6. As a maintainer, I want the refusal vocabulary to name only the codes a pathway can produce, so
   that two dead entries stop implying a surface that does not exist.
7. As a maintainer, I want the library's `message` never rendered, so that no future library version
   can leak another language into the shop.
8. As a Client on a shared connection, I want the failed-**Connexion** counter to key on my own
   address, so that a neighbour's failures do not lock me out.
9. As the shop, I want the **Test de sécurité** to send the Client's address, so that the provider's
   risk decision is made on the right address.
10. As the Recherche limiter, I want the same address rule as authentication, so that one owner
    decides and the two cannot diverge.
11. As a maintainer, I want the suite to run against the version the build installs, so that a green
    suite means something about the shipped code.
12. As a maintainer, I want a check that fails when the installed version is not the lockfile
    version, so that the drift cannot go unnoticed a second time.
13. As a reviewer, I want `auth-pathways.md` to state each pathway's **status**, so that I read
    today's state without knowing the work's history.
14. As a reviewer, I want the five false "absent" claims corrected, so that I do not treat a held
    control as a gap.
15. As an agent reading the repo, I want the pathways statement reachable from the ADR index and from
    `docs/ARCHITECTURE.md`, so that I find it in the reading order the repo imposes.
16. As a future engineer, I want the reason `verification.identifier` is not unique recorded *and
    guarded*, so that I do not "fix" it with a constraint that breaks a resend.
17. As a future engineer, I want the code lifetime to have one value, so that the letter's promise
    and the library's behaviour cannot drift.
18. As a reviewer, I want the threat model written, so that "no MFA" reads as a decision and not an
    omission.
19. As an operator, I want the Administration's absent second factor recorded as a non-goal, so that
    reopening it is its own decision with its own adversary.
20. As a maintainer, I want the three reasons that lived only in deleted comments to have a home, so
    that the no-comments migration does not erase them.
21. As a Client, I want nothing else about my **Connexion** to change, so that the fix carries no new
    step.

## Implementation Decisions

The decisions themselves are already recorded: **ADR-0058** (the seven pathways have one declaration,
`verification.identifier` stays non-unique, the code lifetime has one value), **ADR-0059** (the
**Refus d'authentification** has one owner and the Client never reads the library's sentence),
**ADR-0060** (the threat model and the two orphaned reasons), and the **ADR-0042 amendment** (the
chain rule belongs to the single owner). This spec is their implementation.

- **One neutral module owns the refusal vocabulary.** It exports the closed union of codes, the
  French sentence of each, the generic sentence for a code it does not know, the set of refusals that
  spend a jeton, and the pure predicates the flows need — a code is never compared outside it. The
  copy table is declared against the union, so a missing sentence is a compile error, not a runtime
  fallback.
- **Transport details become codes at the port.** The library's limiter answers a status with no
  code; the mapping lives in the neutral module as a pure function of the status, and the default
  adapter is a one-line call to it. No new mock, no new seam.
- **The sentences that no longer have a producer leave the vocabulary**: `USER_NOT_FOUND` and
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. `EMAIL_NOT_VERIFIED` stays, because the **Connexion**
  receives it and the flow uses it to switch to the code exchange without showing it.
- **The library's `message` is never rendered.** An unknown code renders the generic French
  sentence; the code is logged server-side.
- **The three refusals that spend the jeton renew the Test de sécurité**; the others do not. The set
  is exported by the same module that owns the codes.
- **The address resolver walks the chain from right to left**, skips the trusted ranges, and returns
  the first address that is not one of them, validated by `node:net`. `cf-connecting-ip` and
  `x-real-ip` keep their single-value treatment. The Recherche limiter and the **Test de sécurité**
  inherit the rule without restating it.
- **The dependency floor suite gains one assertion**: for each package it already tracks, the
  installed version must equal the lockfile version. No new file, no new dependency.
- **Two source-reading guards join the existing family** (the one that reads installed sources and
  the ADR index to defend an invariant): one fails if the Prisma schema declares
  `verification.identifier` unique, one fails if the code lifetime the configuration reads and the
  lifetime the letter announces stop coming from the same value.
- **No new dependency, no schema migration, no environment variable.**

## Testing Decisions

A good test here asserts what a Client or a reviewer can observe — the sentence on screen, the
address a limiter keys on, the failure a wrong schema produces — and never a private helper's shape.

The seams, in order of preference:

1. **Existing, extended** — the address resolver's pure-function suite. It already pins the chain
   rule; its expected value changes from the last relay to the first untrusted address.
2. **New, and the only new one** — the neutral refusal module, tested as a pure module, in the
   manner of the form-schema vocabulary suite. One table drives it: every code in the union has a
   sentence, an unknown code has the generic sentence, the spending set is exactly the three named
   codes, and a limiter status maps to its code.
3. **Existing, extended** — the dependency floor suite, for the installed-versus-lockfile assertion.
4. **Existing, reused** — the source-reading guard family, for the schema uniqueness and the code
   lifetime. Prior art: the guard that reads the installed library to defend the revocation
   invariant, and the guard that reads the ADR index.
5. **Existing, reused** — the authentication flow hooks driven through the in-memory port, to prove
   the wiring: the rendered sentence is the module's, and the **Test de sécurité** renews on the
   spending refusals only. No new React seam and no new double.

## Out of Scope

- A second factor, passkeys or TOTP, on the Client or on the Administration. ADR-0060 records the
  Administration gap as a non-goal.
- The Facebook deletion route's change-email pattern, which matches a shape the library never writes.
  It is recorded in ADR-0058 and is unreachable while `changeEmail` is not mounted.
- Replacing Better Auth, and any change to the scrypt cost. Speed is a limit that must not get
  worse, not a goal.
- `@@unique([identifier])` on `verification`. Explicitly rejected; guarded by a test instead.
- Cleaning the duplicate `verification` rows that a resend leaves behind. The library treats them as
  its own design.
- The no-comments migration itself, and any refactor of the auth files it already touched.

## Further Notes

- The sixth defect of the original list is **withdrawn**: the unique constraint was wrong, proven by
  the library's write path. ADR-0058 records both the invariant and the reason the wrong
  recommendation must not survive in the research note.
- Environment: `npm ci` fails on a root-owned `~/.npm` cache (`EACCES`); `npm ci --cache <tmp>` works
  and is the supported workaround. The new version assertion fails until the install is refreshed, by
  design.
- Order of work: refresh the install, then the refusal module, then the address rule, then the
  guards, then the flow wiring. The documents are already written; the guards are what make them
  stay true.
