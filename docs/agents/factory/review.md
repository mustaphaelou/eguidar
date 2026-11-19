# Review mandate

One cold read of a pull request before a person merges it. The reviewer did not write the diff, and it does not fix it.

**Read this file from `origin/main`, never from the pull request's branch.** A diff must not be able to edit the mandate that judges it, nor the standards it is judged against.

```sh
git fetch origin main
git show origin/main:docs/agents/factory/review.md
```

The process section that opened the ticket names this file and nothing else: it is a trigger, not a second copy of these rules. Where it does state a rule, this file wins, and the contradiction is a Standards finding.

## Before reading the diff

- **The spec** — the issue named in the PR title or body (`(#999)`), with its comments: `gh issue view 999 --comments`. No spec is a valid case; say so instead of inventing one.
- **The standards, from `origin/main`** — `AGENTS.md`, `CODING_STANDARDS.md`, `docs/agents/domain.md`, `GLOSSARY.md`, `docs/ARCHITECTURE.md`, and the ADRs that touch the changed area (`docs/adr/README.md` is the index).
- **The gate** — `scripts/checks.sh` and the CI jobs prove that lint, format, types, tests and the build pass; do not re-prove them.
- **The diff** — `gh pr diff <n>`, the PR body, and its `Verification`, `Protected paths` and `Merge Danger` sections.

An ADR or a glossary entry that the diff adds or changes is a **proposal to judge**, not a standard to judge by. Main's rules are the rules.

## Two axes, in this order

1. **Standards** — does the code keep the repository's written rules?
2. **Spec** — does the diff do what the ticket's acceptance says, no more and no less?

Report both, even when empty.

## Severity

**Blocking** — a hard violation of an ADR, of `CODING_STANDARDS.md`, or of the spec's acceptance criteria. Every blocking finding quotes its clause: the ADR number and its section, the standards line, or the exact acceptance sentence. A finding without a citation is not blocking.

**Judgement (advisory)** — design judgement: duplicated code, speculative generality, primitive obsession, shotgun surgery, mysterious names, dead defensive branches, middle men. Name the smell and where it bites; do not demand the rewrite.

## What not to demand

- Formatting or style that Prettier owns.
- Test-coverage percentages.
- Speculative future-proofing, or a rewrite of an accepted ADR.
- Work the ticket does not ask for.

## Size

Run `npx tsx scripts/diff-size.ts origin/main` and quote the line it prints; it leaves out `package-lock.json` and `lib/generated/**`. Above 2,000 changed lines a cold read is not possible. The verdict is `too large for a cold read`; review the Spec axis and the shape only, make no line-level claims, and name what makes the diff large. This review proposes no split and opens no issue: a person cuts the work.

## Audit the evidence

- **`## Verification`** — every acceptance criterion appears once. Re-run the cheap checks (`git diff --name-status -M`, `git diff --summary -M`, `git grep`) and confirm the `met` rows hold; a `met` claim that does not hold, a `not met` row, or a missing criterion is blocking. Judge a `deviated` row against the acceptance text.
- **`## Protected paths`** — every protected path in the diff appears there with its reason. An undeclared one is blocking.
- **CI** — green on the head you review. Pending or red: say so; never claim the checks passed.

## Output

One formal review, event `COMMENT`, in formal English. It opens with:

> This review is produced by an automated agent, not a human.

The first line after it is the verdict, exactly one of:

    Verdict: mergeable
    Verdict: blocking (2)
    Verdict: too large for a cold read

When the diff touches a protected path (listed in `implement.md`), add one line under the verdict:

    Blast radius: data

with one of `checks`, `gate`, `deploy`, `data`, `auth`, `instructions`.

Then:

```markdown
## Standards
### Blocking
### Judgement
## Spec
```

Leave out a heading that has nothing under it. No approval, no request for changes, no merge.

## Re-review

A person's comment on the pull request resumes the ticket for one more pass. Read the previous review, then say what was addressed, what remains, and what is new. Do not repeat findings that were settled.

## Never

No commit, no push, no merge, no approval, no issue, no edit of the pull request, no resolved thread. One review per pass.
