# Factory

Two tasks run unattended on `mustaphaelou/eguidar`. Each is defined by one file here, and each is opened by a process section on the panel of the deployment that runs it.

| Task | Defined by | Runs on |
| --- | --- | --- |
| implement | [implement.md](implement.md) | the `builder` deployment |
| review | [review.md](review.md) | the `superagent` deployment |

A process section says which event opens a ticket and which file to read. It carries no rule of its own: where it states one, the file wins, and the contradiction is a bug to report in the issue.

The panel's sections are configuration rather than files. They are not in this repository, so a change to one is made at the panel and reported with its revision, never shipped in a diff.
