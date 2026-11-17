# Worktrees: one checkout per spec

## Why

A spec or ticket runs in its own checkout so the main checkout stays on `main`.
The agent that runs `git switch` in the main checkout has already broken that
assumption for every other session sharing it.

## Where

A checkout lives inside the repo but out of every tool that walks it:

| Root                    | Made by                 | Kept out by                                             |
| ----------------------- | ----------------------- | ------------------------------------------------------- |
| `.worktrees/<branch>`   | `scripts/worktree.sh`   | `.gitignore`, `.dockerignore`, Vitest, the `grep` tool  |
| `.agents/worktrees/<x>` | the agent worktree tool | `.agents/worktrees/.gitignore`, `.dockerignore`, Vitest |

The main checkout stays on `main`; `git worktree list` is the source of truth.
`EGUIDAR_WORKTREES` moves the first root elsewhere, for a human outside the
agent sandbox — an agent sandboxed to the workspace cannot write outside it.

## Create

```sh
scripts/worktree.sh <branch> [base]
```

The script branches from `origin/main` by default (`<base>` overrides it),
hardlink-copies `node_modules`, copies `.env`, and prints the absolute path on
its last line. `--list` shows the registered worktrees; `--dry-run <branch>`
prints the path and the test database without touching anything.

## Dependencies and secrets

`node_modules` is a real hardlink copy (`cp -al`), never a symlink: a symlink
resolves packages into another checkout, and
`test/dependances/braces-patch.test.ts` then fails with a `../../vendor/...`
path. `.env` is copied for the same reason: tools read it by path.

The copied `.env` gets its own `TEST_DATABASE_URL`, `eguidar_test_<branch>`:
Vitest's global setup truncates every table, so two suites sharing one test
database destroy each other's fixtures mid-run. Create that database once before
the first `npm test` (`createdb eguidar_test_<branch>`); the machine's exact
connection is in `notes/exploitation.md`.

## Checks

Run `bash scripts/checks.sh` inside the worktree. If a path-derived guard fails
only because of the checkout layout, report that instead of re-running the
suite in the main checkout.

## Prune

```sh
scripts/worktree.sh --prune [--dry-run]
```

It removes the checkouts under the root whose branch is merged into
`origin/main`: by ancestry, or by a merged pull request when the merge was a
squash. A checkout with local changes is reported and left, and the branch
survives. `--dry-run` prints the list without touching anything. `git worktree
list` remains the source of truth. Stale checkouts are the default failure, not
an accident.

## Build context

Worktrees are excluded from the Docker context by `.dockerignore` (see
`docker-compose.yml`); `test/contexte-de-build.test.ts` fails if that regresses.
