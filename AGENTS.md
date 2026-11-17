<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## Verify

`CODING_STANDARDS.md` — no comments, and how to prove the work before calling it done.

## Search

Use the `grep` tool for repo-wide search. It is ripgrep: one copy per file. Shell `grep -r` also walks `.worktrees/` and `.agents/worktrees/`, so a merged file answers beside the stale copies it was merged from.

## Agent docs

- **Where code lives** — the file map first, then the couche and couture the change crosses. `docs/agents/domain.md`, `docs/ARCHITECTURE.md`
- **Domain words** — the term `GLOSSARY.md` owns and the decision behind it. `GLOSSARY.md`, `docs/adr/README.md`
- **Authentication** — the seven pathways, what each holds and what it deliberately does not. `docs/auth-pathways.md`
- **Prior research** — the questions already answered, each with its date. `docs/research/`
- **Issues and specs** — GitHub issues, worked through the `gh` CLI. `docs/agents/issue-tracker.md`
- **Triage** — five canonical roles map to label strings. `docs/agents/triage-labels.md`
- **Worktrees** — a spec runs in its own checkout, out of search and the Docker context; checks run there. `docs/agents/worktrees.md`
- **Deployment** — service order, the first-deploy chicken-and-egg, where machine facts live. `docs/agents/exploitation.md`
- **Factory** — the review and implement mandates, read from `origin/main`. `docs/agents/factory/`
