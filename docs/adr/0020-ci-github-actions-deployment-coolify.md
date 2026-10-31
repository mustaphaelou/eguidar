# CI lives in GitHub Actions; deployment stays with Coolify

The storefront deploys automatically: every push to `main` triggers a Coolify webhook that
builds the Docker image, runs the `migrate` service and only then restarts the app. Nothing
verifies a merge first — `main` has no branch protection, and lint, typecheck, the Vitest suite
and the production `next build` are only run by hand, if at all. A broken merge therefore
reaches real customers, and there is no per-commit record of whether the deployed code was ever
checked. This ADR separates the two concerns: continuous integration becomes a gate and a record
in GitHub Actions, while continuous deployment stays with the machinery that already works.

## Decision

- **Continuous integration lives in one GitHub Actions workflow** with five parallel jobs —
  `lint`, `format`, `typecheck`, `test`, `build` — run on every pull request targeting `main`
  and every push to `main`. Each job invokes the existing repository script verbatim; the job
  names are the required status checks.
- **A ruleset on `main` makes green checks a precondition to merge**: pull request required, the
  five checks required, branch required to be up to date with `main`, no review requirement, no
  bypass. Enforcement is enabled only after the workflow's first fully green run.
- **The ruleset requires exactly the checks the workflow declares, and a test says so.**
  `scripts/registre-des-checks/` reads the live ruleset from inside the `test` job, compares it
  to the workflow's job names in both directions, and fails when the two diverge. Adding a job
  is therefore not enough on its own: its status has to be required by the ruleset too, or the
  `test` job goes red on the very pull request that adds it.
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
- **`main` only accepts changes through a pull request** whose five checks are green and whose
  branch is up to date with `main`.
- **Failures surface through GitHub's built-in notifications**; no external webhook or secret
  reports them.

## Amendment — The `build` job builds the deploy image for verification, never for deployment (#676, 2026-10-17)

No sentence of this ADR is rewritten; the amendment records a decision taken after it and names the
earlier sentences it supersedes. Two of them claimed Actions never builds a deploy image. Those
claims no longer hold, and everything that keeps deployment with Coolify still does.

**The decision: the `build` job builds the artifact Coolify builds, and proves it.**

- **Both deploy targets are built, under CI-local tags.** The job builds `runner` and `migrate` from
  the same `Dockerfile` the deploy builds, tags them `eguidar-runner:ci` and `eguidar-migrate:ci`,
  and loads them into the runner's local Docker daemon. Nothing else consumes them: the images are
  the artifact under verification, and the layer cache is the GitHub Actions cache.
- **The probe consumes the artifact, not the host build.** Three health-checked service containers
  — PostgreSQL with database `eguidar_probe`, Redis, Meilisearch — serve it; the compose stack is
  never started, only syntax-checked with `docker compose config -q`. The `migrate` image runs
  twice against `eguidar_probe`: the seed's facts are asserted after the first run — the
  administration account by `ADMIN_EMAIL`, and the six categories — and re-asserted unchanged after
  the second. The Redis cache handler is imported inside the `runner` image, and the `runner` is
  booted on port 3100 to answer the home page (200), one hashed `/_next/static/` asset (200) and
  the admin redirect (307).
- **Nothing is pushed and nothing is deployed.** The tags never leave the runner, no registry login
  is performed, and the workflow keeps `contents: read` — no `packages: write`, no deploy
  credential. No repository secret or variable is added: the two build arguments are the same
  public placeholders (`NEXT_PUBLIC_BETTER_AUTH_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) the host
  build already passes. No deploy trigger and no Coolify API call: the webhook still owns every
  push to `main`, and Actions neither calls it nor gates it.
- **The gate does not grow.** Five jobs and the five required status contexts remain — `lint`,
  `format`, `typecheck`, `test`, `build` — one check per job, the same check list, the same
  ruleset. No sixth job, no sixth context.
- **The image steps are conditional, and drafts skip them.** They run on every push to `main` and
  on every non-draft pull request; `ready_for_review` promotes a draft to the full proof. A draft
  keeps today's host build, and its `build` status can be green without the artifact proof; that is
  acceptable because a draft cannot merge.
- **The job is bounded.** `timeout-minutes: 20`, no automatic retry, no path filters. A red
  artifact check is investigated rather than retried away, and a required check cannot be silently
  skipped into a pending state. Migrations and seed touch only the job-local `eguidar_probe`
  database — never the `test` job's, never a deployed one.

**The sentences this supersedes, and how.**

- The last bullet of **Decision** — "Deployment stays with Coolify, unchanged. ... Actions never
  triggers a deploy, **builds or pushes a deploy image**, runs migrations outside its ephemeral
  test database, or calls the Coolify API." — is superseded on two phrases, and on those only.
  "Builds or pushes a deploy image" splits: "builds" is superseded, because the `build` job now
  builds it for verification; "pushes" still holds, because the images are loaded into the local
  daemon and never pushed. "Runs migrations outside its ephemeral test database" is superseded
  literally, since the probe migrates a second ephemeral, job-local database; what it protected
  stands, as no deployed database is ever touched and the Coolify API is never called.
- The first bullet of **Invariants** — "**No deploy workflow in Actions.** No workflow triggers
  Coolify, **builds or pushes a deploy image**, runs migrations against a deployed database, or
  requires a deployment secret." — is superseded on the same clause, "builds or pushes a deploy
  image": a deploy image is now built, but never pushed, never deployed and never credentialed. The
  rest stands word for word — no deploy workflow, no deployed database, no deployment secret.
- The **`build`** bullet of **Decision** — "so a merge that would fail the Coolify image build is
  caught at pull request time" — read as a promise while the job only ran `next build`, becomes
  literal. Its bound is the draft: the catch happens on every non-draft pull request and every
  `main` push, and at `ready_for_review` for a draft. It is completed, not contradicted.

**What the amendment does not change.**

- **Coolify's deploy behaviour** — webhook on every push to `main`, Dockerfile build, `migrate`
  before the app — is untouched.
- **The rejected considered option stays rejected.** Building the image to a registry and deploying
  from Actions is not what happens: the image is built for verification, loaded locally, and
  deployment keeps its owner. No registry credential, and no deploy trigger, is introduced.
- **CI still requires no repository secret or variable and can only read the repository.**
- **`main` still accepts changes only through a pull request** whose five checks are green and whose
  branch is up to date with `main`.
- **Failures still surface through GitHub's built-in notifications**, with no external webhook or
  secret.

**How the claim is proven.** The artifact is its own proof, and no unit seam can fake it: the
`build` check is green only when both images build, both migrations and the seed run, and the
booted server answers the three HTTP surfaces. A wiring guard in the workflow test pins the probe
step, its draft condition and the job's timeout, so the step cannot disappear silently. The
acceptance the spec requires is a green `build` on a non-draft pull request, and a red one when the
artifact is deliberately broken.

## Amendment — The `build` job gives the build a real catalogue (#759, 2026-10-23)

No sentence of this ADR is rewritten; the amendment records a decision taken after it and names the
earlier sentence it supersedes. The `build` job no longer hands `next build` a placeholder
`DATABASE_URL`; it builds against a catalog it migrated and seeded itself. Everything else about the
job, the gate and the ruleset stands.

**The decision: the build reads the catalogue it prerenders.**

- **The job provisions its own catalogue.** The job's `postgres:16-alpine` service already owns the
  job-local `eguidar_probe` database. The job now runs `prisma migrate deploy` and `prisma db seed`
  against it, then runs `npm run build` with `DATABASE_URL` pointing at the same database. The
  build preflight (`scripts/verifier-catalogue-de-build.ts`) therefore reads a real catalogue
  instead of failing on a placeholder.
- **The Docker image build receives the same URL as a BuildKit secret.**
  `docker/build-push-action` passes `database_url=postgresql://…/eguidar_probe` through its
  `secrets` input, and the builder shares the host's network (`driver-opts: network=host`, with
  `network: host` on the build) so the build reaches the job's service on `127.0.0.1:5432`. The
  `docker-container` driver cannot resolve `host-gateway`, hence the network mode rather than
  `add-hosts`. The `Dockerfile` mounts the secret for the single build `RUN`
  (`--mount=type=secret,id=database_url,env=DATABASE_URL`), so the value is never a build argument,
  an image layer or an entry in `docker history`.
- **No repository secret is added.** The URL names a job-local database with fixed, ephemeral
  credentials; it is not a repository secret or variable, and the workflow keeps `contents: read`.
- **The gate does not grow.** Five jobs and the five required status contexts remain — `lint`,
  `format`, `typecheck`, `test`, `build`. No sixth job, no sixth context, and the ruleset is
  unchanged.

**The sentences this supersedes, and how.**

- The **`build`** bullet of **Decision** — "The `build` job reproduces the production build contract
  — Prisma client generated first, placeholder `DATABASE_URL` and placeholder public env vars — so a
  merge that would fail the Coolify image build is caught at pull request time. Placeholders are
  public values only; no secret is involved." — is superseded on **"placeholder `DATABASE_URL`"**
  only. That URL is now the job-local `eguidar_probe` catalogue the job migrates and seeds before
  building, for the host build and for the image build alike. The public env vars
  (`NEXT_PUBLIC_BETTER_AUTH_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) remain public placeholders, and
  "no secret is involved" still means no repository secret: the catalogue URL is not one. Prisma
  client generation first, the reproduced production build contract and the pull-request catch all
  stand.

**What the amendment does not change.**

- **Coolify's deploy behaviour** — webhook on every push to `main`, Dockerfile build, `migrate`
  before the app — is untouched.
- **CI still requires no repository secret or variable and can only read the repository.** The
  catalogue URL is created and consumed inside the job.
- **`main` still accepts changes only through a pull request** whose five checks are green and whose
  branch is up to date with `main`; the five required status contexts are unchanged.
- **The rejected considered option stays rejected.** Nothing is pushed to a registry, and no deploy
  trigger or deploy credential is introduced.

**How the claim is proven.** The `build` job fails before prerendering when the catalogue is
unreachable, and the same job boots the built server and checks its HTTP surfaces. A workflow test
pins the migrate, seed and secret wiring, so none of it can disappear silently.

## Amendment — The Porte de fusion is a versioned contract, and the live ruleset is read by a local doctor (#785, 2026-10-26)

No sentence of this ADR is rewritten; the amendment records a decision taken after it and names the
sentences it supersedes. The live ruleset is no longer compared to the workflow from the `test`
job: the contract lives in the repository, the comparison is pure, and the live read becomes a
local doctor that is honest about its limits.

**The decision: the contract is the source of truth, and the live read is a doctor.**

- **The contract is a checked-in artifact.** `infra/porte-de-fusion.json` records the expected
  ruleset name, the branch it must cover (`refs/heads/main`), the five required contexts —
  `build`, `format`, `lint`, `test`, `typecheck`, sorted — and the policy facts that make them a
  gate: pull request required, branch required up to date, do-not-enforce-on-create off, no review
  requirement, empty bypass. The keys are domain terms; GitHub's English API names stay in the
  adapter. `infra/porte-de-fusion.ts` owns the type and the parser: a missing or mistyped field is
  refused by name, never filled with a default.
- **The comparison to the workflow is pure and runs in the `test` job.**
  `infra/porte-de-fusion.test.ts` reads the contract and the workflow's job names, compares them
  in both directions, and fails with a message naming the contract, the context and the mechanical
  fix. The contract test is the single owner of the five-job list; `build-secrets.test.ts` keeps
  its build-wiring and `contents: read` assertions and drops its exact five-job-set assertion.
- **The live read is a local doctor, never a CI guard.** `npm run porte:verifier` selects the
  single repository ruleset whose condition covers `refs/heads/main`; the contract's name is a
  selector and tiebreaker, never a compared gate fact. It compares only the contract-owned facts —
  the five contexts as a set, strict up-to-date, do-not-enforce-on-create, the pull-request rule,
  zero required reviews, an empty bypass list and the branch condition — and ignores unrelated
  rules (`deletion`, `non_fast_forward`, `creation`), IDs, versions and timestamps. It exits `0`
  on a match, `1` on drift while printing the differing facts, and `2` when the ruleset cannot be
  read: a `403`/`404` plan, visibility or token block, a missing repository or token, exhausted
  retries, or several qualifying rulesets that the contract's name cannot separate. It is
  verify-only: no `PUT`, no automatic reconciliation. The doctor resolves the repository from
  `GITHUB_REPOSITORY` or the `gh` session and its token from `GH_TOKEN` or `gh auth token`; it
  never reads the CI `GITHUB_TOKEN`.
- **The `test` job no longer exports `GITHUB_TOKEN`.** The workflow keeps `contents: read`, no
  repository secret, variable or PAT is added, and no sixth job appears. The skipped live-read
  suite and the old live reader are deleted; no green run contains a skipped gate check and no
  code path outside the doctor reads the live ruleset.
- **The historical drift is recorded.** The live ruleset once required four contexts — `lint`,
  `typecheck`, `test`, `build` — while the workflow already declared five, because `format` was
  added later. A pull request with a red `test` job was merged, and the live-read suite skipped
  instead of failing, so a green CI hid a gate that did not match the workflow. The contract now
  records the correct five.
- **The plan block is named, never skipped.** A `2` is not drift and not an implementation
  failure: it is the honest outcome when the plan, the repository visibility or the token makes
  the ruleset unreadable, and the doctor prints the plan-or-visibility remedy. On a session that
  can read the ruleset, the same command exits `0`; both paths are proven (the readable one by the
  local run, the blocked one by fixtures). When a plan, visibility or token change is what blocks
  the read, closing that block is what makes the doctor the live proof; the contract already
  records the correct five contexts.

**The sentences this amendment supersedes, and how.**

- The **Decision** bullet "The ruleset requires exactly the checks the workflow declares, and a
  test says so. `scripts/registre-des-checks/` reads the live ruleset from inside the `test` job,
  compares it to the workflow's job names in both directions, and fails when the two diverge.
  Adding a job is therefore not enough on its own: its status has to be required by the ruleset
  too, or the `test` job goes red on the very pull request that adds it." — is superseded on its
  mechanism, and on that only. The live comparison is no longer a CI guard, and
  `scripts/registre-des-checks/` no longer exists. The invariant stands: adding a job is not
  enough on its own, because a workflow job that the contract does not require still fails the
  contract test on the pull request that adds it. What changes is where the proof lives: a pure
  test owns the contract-to-workflow comparison, and the live ruleset is read by the local doctor,
  never by CI.

**What the amendment does not change.**

- **Five jobs and five required status contexts remain** — `lint`, `format`, `typecheck`, `test`,
  `build`. No sixth job and no sixth context.
- **CI requires no repository secret or variable and can only read the repository.**
- **Coolify's deploy behaviour** — webhook on every push to `main`, Dockerfile build, `migrate`
  before the app — is untouched.
- **`main` still accepts changes only through a pull request** whose five checks are green and
  whose branch is up to date with `main`.
- **Applying the contract to GitHub remains a separate, explicit action.** No `PUT`, no
  `porte:appliquer`, no automatic reconciliation is built by this amendment.

**How the claim is proven.** `bash scripts/checks.sh` is green, including the pure contract test.
Deliberately adding a sixth job or flipping a policy fact fails that test with the contract named
in the message. `npm run porte:verifier` exits `0` when the live ruleset matches; the `2` path is
fixture-tested for `403`/`404`, exhausted retries, a missing token and several candidates, and
names the plan-or-visibility remedy.
