# Implement mandate

One `ready-for-agent` issue becomes one pull request. Nothing else.

**Read this file from `origin/main` before starting.**

```sh
git fetch origin main
git show origin/main:docs/agents/factory/implement.md
```

The process section that opened the ticket names this file and nothing else: it is a trigger, not a second copy of these rules. Where it does state a rule, this file wins, and the contradiction is a bug to report in the issue.

## One run

The issue and its comments are the spec. The executor has already prepared the worktree; run the whole chain, in this order:

1. Work on the branch the executor prepared — `agent/<ticket name>`, cut from `origin/main` — and never rename it.
2. Implement the acceptance criteria with tests, using the glossary's words in names, tests and the pull request.
3. `bash scripts/checks.sh` green in the worktree.
4. Open the pull request, non-draft, with the `agent` label, the automated line, `Closes #<issue>`, the `## Verification` table and `## Protected paths`.
5. Watch CI on that pull request — `gh pr checks <number> --watch` — and make it green. On a red check, fix and push; after two failed attempts, report `blocked` naming the check.
6. Report `ready` only when CI is green. One issue, one branch, one pull request; no second ticket, no drive-by fix. A proposal to split the work is for a person to act on: no run opens the issues it names. If you push after the review has started, say so in one pull-request comment naming the new head.

## Definition of done

- `bash scripts/checks.sh` is green in the worktree, and CI is green on the pull request. The Evidence section quotes the local final line; the Verification table records the CI result.
- The behaviour has tests, in the repo's layout: `test/` or `*.test.ts` beside the module.
- An ADR or a `GLOSSARY.md` entry changes only when an acceptance criterion names that ADR or that term; any other change to one is the Escalation below — not an entry under `## Decisions`, and not an amendment. A proposal the diff adds there is judged like code.
- The pull request is opened **non-draft**: the review Source does not observe draft → ready.
- The pull request carries the `agent` label, the `## Verification` table and the `## Protected paths` section.
- The title is one English sentence.

## Body

The automated line first, then the repository's template:

```markdown
> Produced by an automated agent, not a human.

## Summary

<the change, one paragraph, a small diff sketch when it helps>

Closes #<issue>

## Evidence

- **Before:** <the command and its failing output, or the behaviour that was wrong>
- **After:** `bash scripts/checks.sh` → <its final line>; <targeted commands and counts>

## Verification

| Acceptance criterion | Command or artifact | Status |
| --- | --- | --- |
| <criterion from the issue> | `<command>` → `<result>`, or <artifact and where> | met |
| <criterion from the issue> | <what was done and why> | deviated — <what a person must accept> |
| <criterion from the issue> | <why it is not met> | not met |

Every acceptance criterion appears exactly once. `met` is backed by a command or artifact; `deviated` names what the acceptance cannot hold as written and what a person must accept; `not met` means the run could not satisfy it — report `blocked` rather than pretending. A deviation belongs in this table, not in `## Decisions`.

## Protected paths

<one line per protected path in the diff: the path, why the acceptance needs it, what changes. Write "None." when the diff touches none.>

## Merge Danger

**Door:** <one-way or two-way>

<what a revert costs; whether a schema, migration, dependency or variable changes>

**Blast Radius:** <one word: cache, orders, auth, deploy…>

## Decisions

<the local calls you made and why; omit the section when there are none>
```

## Blast radius — check, and stop unless the acceptance requires it

Check the diff against this list. A protected path the ticket does not require: stop and report `blocked`. A protected path the acceptance requires: edit it, list it under `## Protected paths` with the reason, and let the review mark `Blast radius:`; a person decides at merge.

- **checks and gate** — `.github/workflows/**`, `scripts/checks.sh`, `scripts/ci-liste.ts`, `scripts/format.ts`, `scripts/porte-de-fusion/**`, and any script the CI list invokes.
- **deploy** — `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `infra/**`.
- **data** — `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/seed*.ts`.
- **auth** — `lib/auth.ts`, `lib/auth-form-schemas.ts`, `lib/oauth-providers.ts`, `app/api/auth/**`.
- **its own instructions** — `AGENTS.md`, `docs/agents/**`.
- `.env*`, and dependency or script changes in `package.json` and `package-lock.json`.

## Escalation

- Implementable as written → implement it. The label means the spec is complete.
- The acceptance asked for the decision → make it, and carry it as one of its criteria.
- The implementation changes a decision the acceptance did not name — a public contract, an ADR, a domain term → stop, ask in the issue, report `blocked`. Never invent scope, never "fix while here", and never file it under `## Decisions`: a local call is naming and shape, not a decision.
- Naming and local shape → decide, and list the calls under `## Decisions`.

## Conduct

- Push the branch to `mustaphaelou/eguidar`, open the pull request against `main`, watch CI, and stop once it is green. No merge, no deploy, no `gh pr merge`, no push to `main`.
- The automated line is mandatory: the account has human commits too, and the repository squash-merges, so the pull request is the durable record.
- No `.scratch/` writes and no citation of the ticket directory: the ticket directory is the scratch, and it is deleted when the ticket ends.
- English on the GitHub surface — the title, the body, the comments, and any question left in the issue — carrying the glossary's French terms exactly as it spells them. The product's copy and the code's vocabulary stay French.

## Blocked report

Say what is blocked, which protected path or decision stops it, and what a person must decide. Stop there. The ticket waits for a person; it does not end.
