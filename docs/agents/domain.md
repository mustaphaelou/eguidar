# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — the single context. This repo has one domain, so there is no `GLOSSARY-MAP.md`.
- **[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)** — where things live: the five couches, the nine coutures, the eleven lois.
- **[`docs/adr/README.md`](../adr/README.md)** — the index of the 49 decisions, grouped by theme, with the most-cited ones marked. Read the ADRs that touch the area you're about to work in.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md            ← domain vocabulary
├── docs/
│   ├── ARCHITECTURE.md    ← where things live
│   └── adr/               ← decisions, indexed by docs/adr/README.md
├── app/                   ← routes, Server Actions, the seven API handlers
├── components/            ← the UI kit and the client surfaces
└── lib/
    ├── use-cases/         ← business reads and writes
    ├── automations/       ← the durable worker
    └── *.ts               ← the domain modules
```

There is no `src/`. The `@/*` path alias resolves to the repo root.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids — every entry carries an `_Avoid_:` line, and it is binding.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

Architecture words — *couture*, *couche*, *garde*, *module neutre*, *port*, *adaptateur* — are **not** domain words. They are defined in `docs/ARCHITECTURE.md` §6 and do not belong in `GLOSSARY.md`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (Visiteur cookie Panier), but worth reopening because…_

An ADR is amended in place with a `## Amendement` section, or replaced by a later one that names it. Never rewrite a decision's body to match new behaviour: amend it.

## Anchors

When you cite code from a document, cite a **symbol or a path**, never a line number. `lib/carte-produit.ts` and `projeterCarteProduit` survive a refactor; `lib/carte-produit.ts:51` does not. Some older ADRs still carry line anchors — that is known debt (spec #916), not a precedent.
