# Implement mandate

One `ready-for-agent` issue becomes one pull request. Nothing else.

**Read this file from `origin/main` before starting.**

```sh
git fetch origin main
git show origin/main:docs/agents/factory/implement.md
```

## One run

- The issue and its comments are the spec. Use the glossary's words in names, tests and the pull request.
- Branch `agent/<issue>-<slug>` off `origin/main`, in the worktree the executor gave you.
- One issue, one branch, one pull request. No second ticket, no drive-by fix.

## Definition of done

- `bash scripts/checks.sh` is green in the worktree — the same five command-bearing checks CI runs. The Evidence section quotes its final line.
- The behaviour has tests, in the repo's layout: `test/` or `*.test.ts` beside the module.
- An ADR is amended or added when the ticket changes a decision; `GLOSSARY.md` is updated when it changes a domain term. A new ADR or entry in the diff is a proposal, reviewed like code.
- The pull request is opened **non-draft**: the review Source does not observe draft → ready.
- The pull request carries the `agent` label.
- The title is one French sentence, in the register of `git log --oneline` on `main`.

## Body

The automated line first, then the repository's template:

```markdown
> Produit par un agent automatique, pas un humain.

## Summary

<the change, one paragraph, a small diff sketch when it helps>

Closes #<issue>

## Evidence

- **Before:** <the command and its failing output, or the behaviour that was wrong>
- **After:** `bash scripts/checks.sh` → <its final line>; <targeted commands and counts>

## Merge Danger

**Door:** <one-way or two-way>

<what a revert costs; whether a schema, migration, dependency or variable changes>

**Blast Radius:** <one word: cache, orders, auth, deploy…>

## Decisions

<the local calls you made and why; omit the section when there are none>
```

## Blast radius — stop and report `blocked`

Do not edit these. Report the path and the reason; a person decides.

- **checks and gate** — `.github/workflows/**`, `scripts/checks.sh`, `scripts/ci-liste.ts`, `scripts/format.ts`, `scripts/porte-de-fusion/**`, and any script the CI list invokes.
- **deploy** — `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `infra/**`.
- **data** — `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/seed*.ts`.
- **auth** — `lib/auth.ts`, `lib/auth-form-schemas.ts`, `lib/oauth-providers.ts`, `app/api/auth/**`.
- **its own instructions** — `AGENTS.md`, `docs/agents/**`.
- `.env*`, and dependency or script changes in `package.json` and `package-lock.json`.

## Escalation

- Implementable as written → implement it. The label means the spec is complete.
- A choice that would change a public contract, an ADR, or a domain term → stop, ask in the issue, report `blocked`. Never invent scope, never "fix while here".
- Naming and local shape → decide, and list the calls under `## Decisions`.

## Conduct

- Push the branch to `mustaphaelou/eguidar`, open the pull request against `main`, and stop. No merge, no deploy, no `gh pr merge`, no push to `main`.
- The automated line is mandatory: the account has human commits too, and the repository squash-merges, so the pull request is the durable record.
- No `.scratch/` writes and no citation of the ticket directory: the ticket directory is the scratch, and it is deleted when the ticket ends.
- French for the title, body and comments; the code speaks the glossary's vocabulary.

## Blocked report

Say what is blocked, which protected path or decision stops it, and what a person must decide. Stop there. The ticket waits for a person; it does not end.
