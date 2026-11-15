# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — the single context. This repo has one domain, so there is no `GLOSSARY-MAP.md`.
- **[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)** — where things live: the five couches, the nine coutures, the eleven lois.
- **[`docs/adr/README.md`](../adr/README.md)** — the index of the decisions, grouped by theme, with the most-cited ones marked. Read the ADRs that touch the area you're about to work in.

## File structure

Single-context repo:

```
/
├── AGENTS.md              ← the entry point for an agent
├── GLOSSARY.md            ← domain vocabulary
├── docs/
│   ├── ARCHITECTURE.md    ← where things live
│   ├── adr/               ← decisions, indexed by docs/adr/README.md
│   └── agents/            ← this folder: how agents work here
├── app/                   ← routes, Server Actions, the seven API handlers
├── components/            ← the UI kit and the client surfaces
├── lib/
│   ├── images-produit/    ← the Images produit concept
│   ├── use-cases/         ← business reads and writes
│   ├── automations/       ← the durable worker
│   └── *.ts               ← the domain modules
├── cache-handlers/        ← the Redis cache adapter Next calls
├── prisma/                ← schema, migrations, seeds
├── scripts/               ← checks.sh, the CI check list, deployment helpers
├── test/                  ← shared fixtures and cross-module guards
│   └── dependances/       ← the dependency gardes
├── e2e/                   ← the Playwright probe and its harness
├── infra/                 ← Cloudflare rulesets, generated from code
├── docker/                ← image entrypoints and helpers
└── vendor/                ← the vendored braces copy (ADR-0031)
```

Everything else at the root is configuration, assets, or working space: the tracked `plans/` and `prototype/`, and the gitignored `notes/`, `.scratch/`, `.worktrees/`, `.agents/`.

There is no `src/`. The `@/*` path alias resolves to the repo root.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids — every entry carries an `_Avoid_:` line, and it is binding.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

Architecture words — _couture_, _couche_, _garde_, _module neutre_, _port_, _adaptateur_ — are **not** domain words. They are defined in `docs/ARCHITECTURE.md` §6 and do not belong in `GLOSSARY.md`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (Visiteur cookie Panier), but worth reopening because…_

An ADR is amended in place with a `## Amendement` section, or replaced by a later one that names it. Never rewrite a decision's body to match new behaviour: amend it.

## Anchors

When you cite code from a document, cite a **symbol or a path**, never a line number. `lib/carte-produit.ts` and `projeterCarteProduit` survive a refactor; `lib/carte-produit.ts:51` does not. Some older ADRs still carry line anchors — that is known debt (spec #916), not a precedent.
