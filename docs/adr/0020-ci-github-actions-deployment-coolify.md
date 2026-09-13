# CI lives in GitHub Actions; deployment stays with Coolify

The storefront deploys automatically: every push to `main` triggers a Coolify webhook that
builds the Docker image, runs the `migrate` service and only then restarts the app. Nothing
verifies a merge first — `main` has no branch protection, and lint, typecheck, the Vitest suite
and the production `next build` are only run by hand, if at all. A broken merge therefore
reaches real customers, and there is no per-commit record of whether the deployed code was ever
checked. This ADR separates the two concerns: continuous integration becomes a gate and a record
in GitHub Actions, while continuous deployment stays with the machinery that already works.

## Decision

- **Continuous integration lives in one GitHub Actions workflow** with four parallel jobs —
  `lint`, `typecheck`, `test`, `build` — run on every pull request targeting `main` and every
  push to `main`. Each job invokes the existing repository script verbatim; the job names are the
  required status checks.
- **A ruleset on `main` makes green checks a precondition to merge**: pull request required, the
  four checks required, branch required to be up to date with `main`, no review requirement, no
  bypass. Enforcement is enabled only after the workflow's first fully green run.
- **The `test` job runs against an ephemeral `postgres:16-alpine` service container** and the
  suite keeps running serially (`fileParallelism: false`): CI never touches a shared or
  production database, and the global setup's truncation stays safe.
- **The `build` job reproduces the production build contract** — Prisma client generated first,
  placeholder `DATABASE_URL` and placeholder public env vars — so a merge that would fail the
  Coolify image build is caught at pull request time. Placeholders are public values only; no
  secret is involved.
- **CI requires zero repository secrets and runs with `contents: read`.** Node is pinned to 22
  (matching the `node:22-alpine` production image) in a single version file; npm and the Next.js
  build cache are reused; superseded pull-request runs are cancelled, `main` runs never are.
- **Deployment stays with Coolify, unchanged.** Its webhook auto-deploys every push to `main`,
  builds the Dockerfile through the docker-compose build pack, runs the `migrate` service
  (Prisma generate + `migrate deploy` + seed) and starts the app only once it succeeds. Actions
  never triggers a deploy, builds or pushes a deploy image, runs migrations outside its ephemeral
  test database, or calls the Coolify API.

## Considered Options

- **Actions-triggered or gated Coolify deploys** (call the webhook after green checks, or hold
  the deploy until they pass) — rejected: it couples CI to deployment and puts a Coolify API
  token on the critical path as a new secret. The webhook already deploys correctly on every
  `main` push; gating the merge that produces that push is enough, and keeps the two concerns
  independent.
- **Full deploy ownership from Actions** (build the image to GHCR, deploy from Actions) —
  rejected: it duplicates the working Docker/docker-compose deploy machinery — migration
  ordering, health checks — for no benefit, and adds registry and deploy credentials plus new
  failure modes. Coolify's deploy is already correct and takes about two minutes; CI has nothing
  to gain by taking it over.

## Invariants

- **No deploy workflow in Actions.** No workflow triggers Coolify, builds or pushes a deploy
  image, runs migrations against a deployed database, or requires a deployment secret.
- **CI requires no repository secrets or variables**; it can only read the repository.
- **Coolify's deploy behaviour is unchanged** — webhook on every push to `main`, Dockerfile
  build, `migrate` before the app — so shipping CI cannot change how the site is deployed.
- **`main` only accepts changes through a pull request** whose four checks are green and whose
  branch is up to date with `main`.
- **Failures surface through GitHub's built-in notifications**; no external webhook or secret
  reports them.
