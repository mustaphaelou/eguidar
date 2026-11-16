# Coding standards

## No comments

First-party code carries no prose. A comment the tooling reads is code, and
those are the only ones that survive: `npm run lint` fails on every other one
through `eguidar/sans-commentaires`, naming the line it wants gone.

What a comment would have said belongs where a later reader looks: the code's
names and shape, a test that goes red when the reason stops being true, an ADR,
or the GLOSSARY.

## Before calling work done

Run `bash scripts/checks.sh`.

## At commit time

Fix the file the commit-time format gate names.
