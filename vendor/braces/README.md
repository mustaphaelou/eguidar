# braces, vendored

This directory is [`braces`](https://github.com/micromatch/braces) `3.0.3` — the
last release on the registry — carrying one local patch. `package.json` installs
it as `file:vendor/braces` and routes every transitive requirer to it through
`overrides: { "braces": "$braces" }`, so `node_modules/braces` is this copy and
the registry release is nowhere in the lockfile.

## Why it is here

`braces` through `3.0.3` is affected by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) /
CVE-2026-93687 (CWE-674). `parse()` bounds the length of its input
(`MAX_LENGTH = 10000`) but never the nesting depth of the block stack it builds,
and `compile()`, `expand()` and `stringify()` each walk that tree recursively,
one stack frame per level. A pattern well under the character cap — 4 000 nested
braces is 8 001 characters — raises `RangeError: Maximum call stack size
exceeded`; uncaught, it terminates the Node process. Nested parentheses reach the
same sink, because `parse()` pushes a block for each.

The advisory has no fixed release: `3.0.3` is still `latest`, upstream issue
[micromatch/braces#70](https://github.com/micromatch/braces/issues/70) is open,
and `first_patched_version` is null. A version floor therefore cannot be pinned —
every release the registry offers is the vulnerable one. The graph is corrected
instead: the vulnerable copy is replaced, and every requirer is pointed at the
replacement.

## Why `3.0.4-patched.0`

The copy declares a version **above** `3.0.3` on purpose. The advisory range is
`<= 3.0.3`, and a prerelease of `3.0.3` reads as *below* `3.0.3` to the tooling
that evaluates it — Dependabot among them — so `3.0.3-patched.0` would still fall
inside the range and the alert would stay open. `3.0.4-patched.0` sits outside it
under either reading of the precedence rules, and still says what it is: the next
patch level, locally patched.

## What the patch does

`parse()` refuses a pattern whose block nesting passes `MAX_DEPTH` (100), the
same way it already refuses one whose length passes `MAX_LENGTH`. The check sits
where the stack grows rather than at the top of the parse loop: an input that
opens more blocks than it closes never returns to that loop before the walkers
run. `options.maxDepth` mirrors `options.maxLength` — a caller may lower the
bound, never raise it past the package's own guard.

Depth is bounded, not the character count, so ordinary globs are unaffected:
`micromatch` and `fast-glob` feed this copy patterns written by this repository,
and none of them nests anywhere near 100 deep.

The whole divergence from upstream is the two hunks below, generated with
`diff -u` against a pristine `3.0.3` — `npm pack braces@3.0.3` in a scratch
directory, since `node_modules/braces` is this copy once the override is in
place:

```diff
--- a/lib/constants.js
+++ b/lib/constants.js
@@ -3,6 +3,12 @@
 module.exports = {
   MAX_LENGTH: 10000,
 
+  // PATCH (GHSA-vfj7-8cjw-p6xm): the depth of the block stack `parse` builds,
+  // and with it the recursion depth of every AST walker. Upstream bounds only
+  // characters; a pattern under `MAX_LENGTH` with a few thousand nesting levels
+  // still exhausts the call stack.
+  MAX_DEPTH: 100,
+
   // Digits
   CHAR_0: '0', /* 0 */
   CHAR_9: '9', /* 9 */
--- a/lib/parse.js
+++ b/lib/parse.js
@@ -8,6 +8,7 @@
 
 const {
   MAX_LENGTH,
+  MAX_DEPTH,
   CHAR_BACKSLASH, /* \ */
   CHAR_BACKTICK, /* ` */
   CHAR_COMMA, /* , */
@@ -39,6 +40,10 @@
     throw new SyntaxError(`Input length (${input.length}), exceeds max characters (${max})`);
   }
 
+  // PATCH (GHSA-vfj7-8cjw-p6xm): `maxDepth` mirrors `maxLength` — a caller may
+  // lower the bound, never raise it past the package's own guard.
+  const maxDepth = typeof opts.maxDepth === 'number' ? Math.min(MAX_DEPTH, opts.maxDepth) : MAX_DEPTH;
+
   const ast = { type: 'root', input, nodes: [] };
   const stack = [ast];
   let block = ast;
@@ -71,6 +76,21 @@
     return node;
   };
 
+  /**
+   * PATCH (GHSA-vfj7-8cjw-p6xm): the block stack carries one frame per nesting
+   * level — braces and parentheses alike — and `compile`, `expand` and
+   * `stringify` each recurse one stack frame per block. Refusing here bounds
+   * all three walkers at once; a guard inside one walker would leave the other
+   * two open, and the check has to sit where the stack grows rather than at the
+   * top of the loop, because an input that opens more blocks than it closes
+   * never returns to the loop before the walkers run.
+   */
+  const assertDepth = (level, limit) => {
+    if (level > limit) {
+      throw new SyntaxError(`Input nesting depth (${level}), exceeds max depth (${limit})`);
+    }
+  };
+
   push({ type: 'bos' });
 
   while (index < length) {
@@ -145,6 +165,7 @@
     if (value === CHAR_LEFT_PARENTHESES) {
       block = push({ type: 'paren', nodes: [] });
       stack.push(block);
+      assertDepth(stack.length - 1, maxDepth);
       push({ type: 'text', value });
       continue;
     }
@@ -211,6 +232,7 @@
 
       block = push(brace);
       stack.push(block);
+      assertDepth(stack.length - 1, maxDepth);
       push({ type: 'open', value });
       continue;
     }
```

## Removing it

When the registry publishes a release that bounds depth, delete this directory,
drop `braces` from `devDependencies`, drop the `braces` entry from `overrides`,
regenerate `package-lock.json`, and put `braces-patch.test.ts` back into the
shape of the other patch guards: a floor, `satisfiesPatchFloor`, and an override.
`braces-patch.test.ts` fails the moment the copy here stops being the installed
one, so the removal cannot be half-done.

The decision to vendor rather than pin, patch in place, or drop the tooling is
recorded in [ADR-0031](../docs/adr/0031-copie-vendue-de-braces.md).

## License

MIT, as upstream. See `LICENSE`.
