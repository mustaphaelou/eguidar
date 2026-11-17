# Specs that drove a session

A spec is the design record of a session: the problem, the user stories, the implementation and testing decisions, and what was out of scope. A decision lives in [`docs/adr/`](../adr/README.md); a word lives in [`GLOSSARY.md`](../../GLOSSARY.md). The spec is the reasoning between them, kept because a GitHub issue body is edited and a spec is read.

Every spec here is linked below. [`test/index-des-specs.test.ts`](../../test/index-des-specs.test.ts) fails when one is missing, and when a link points at nothing.

| Spec | Subject | Decisions |
| --- | --- | --- |
| [Connexion refusals and pathways](connexion-refus-et-voies.md) | The refusal vocabulary, the address rule, the code lifetime, and the seven pathways' declaration | ADR-0058, ADR-0059, ADR-0060 |
| [Retours, Encaissements and Remboursements](retours-encaissements-remboursements.md) | The Retour / Encaissement / Remboursement split, the revenue reads, the zoned timestamps | ADR-0055, ADR-0056, ADR-0057 |
