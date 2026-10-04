# TypeScript 7 (native port) via npm alias, keeping TS 6 for the ESLint toolchain

We upgraded the codebase to TypeScript 7.0.2 — the native (Go) rewrite — but TypeScript 7 ships no JavaScript compiler API, and `typescript-eslint` (pulled in by `eslint-config-next`) still caps its peer range at `>=4.8.4 <6.1.0` and crashes at module load under TS 7 (typescript-eslint#10940, no ETA). So `typescript` is aliased to `npm:@typescript/typescript6@^6.0.2` (TS 6.0 API for the ESLint toolchain, ships `tsc6`) while `@typescript/native` aliases `npm:typescript@^7.0.2` (the real native `tsc`). `npx tsc` and `next build` run TS 7; `eslint` keeps working on the TS 6 engine. tsconfig also sets `"types": ["node"]` explicitly because TS 7 defaults `types` to `[]` (no auto-inclusion of `@types/*`).

Why: TS 7 is the only way to get the native compiler's speed today, and Microsoft's own 7.0 announcement documents this exact side-by-side alias as the recommended fix for tools that import the `typescript` API. The alternative — pinning `typescript@^6` — would forgo the native compiler entirely until typescript-eslint ships TS 7 support.

Considered options: pinning `typescript@^6` until typescript-eslint#10940 closes (rejected — no native speed, upgrade becomes cosmetic); forcing the peer range via `overrides`/`--legacy-peer-deps` (rejected — silences npm but cannot stop the typescript-eslint module-load crash, since TS 7 exposes no API); upgrading Next to 16.3.x (rejected — `eslint-config-next`'s `typescript-eslint@^8.46.0` dependency is unchanged).

Consequences: every future consumer of the TS compiler API must keep resolving `typescript` as `@typescript/typescript6`; ESLint's type-aware rules run on TS 6's view of the world, not TS 7's; and the `plugins: [{name:"next"}]` editor plugin (API-based) is unverified under TS 7's native LSP — editor-side behavior should be checked separately.

## Amendement — `next build` ne typechecke pas avec TypeScript 7

Comme le veut la convention du dépôt, aucune phrase de la décision n'est changée. Une phrase
seule est fausse, et c'est celle qu'un lecteur vérifierait en premier : « `npx tsc` and
`next build` run TS 7; `eslint` keeps working on the TS 6 engine ». La moitié gauche est
vraie, la moitié droite non.

- **`npx tsc` est bien TypeScript 7.** `node_modules/.bin/tsc` pointe sur le binaire natif de
  `@typescript/native`, et c'est lui que le check `typecheck` de la CI exécute.

- **`next build` typechecke avec TypeScript 6**, et son réglage ne peut pas y changer quoi que ce
  soit. La raison tient en une ligne : Next résout le **nom** `typescript`
  (`resolveFrom(baseDir, 'typescript/package.json')`), et ce nom est aliasé sur
  `@typescript/typescript6`. Next ne cherche pas le binaire `tsc` du `PATH`.

  - `experimental.useTypeScriptCli: false` — ce que fixe
    [`next.config.ts:4-6`](../../next.config.ts#L4-L6) — passe par l'API JavaScript du
    compilateur, résolue par ce nom : TypeScript 6.
  - `experimental.useTypeScriptCli: true` — le défaut de Next 16.3 — lit le champ `bin` du
    paquet résolu. `bin.tsc` y est absent, et Next retombe alors sur son motif `/^tsc\d+$/`,
    qui trouve `tsc6` — encore TypeScript 6.

  Les deux directions aboutissent à TypeScript 6. Le seul levier est le paquet vers lequel
  pointe le nom `typescript`, et le déplacer casse `eslint` (amendement suivant).

**Ce que cela change pour la CI.** Sur les cinq jobs, un seul exécute le compilateur natif :
`typecheck`. Le job `build` typechecke avec TypeScript 6. Les deux passent aujourd'hui sur le
même code, mais deux compilateurs peuvent diverger — TypeScript 7 refuse là où 6 accepte, sur
des cas documentés (nom d'énumération et étalement d'objet, par exemple). Rien n'est observé
dans ce dépôt ; c'est ce que cet ADR laissait croire en annonçant le build comme couvert.

## Amendement — Le pont TypeScript 6 est porteur, et ce que sa levée coûterait

La décision présente le pont comme le moyen d'obtenir la vitesse du compilateur natif. Elle ne
dit ni ce qui le ferait disparaître, ni ce que coûterait de le lever. Les deux se disent ici.

**Il est porteur.** `typescript-eslint` ne se contente pas de déclarer `>=4.8.4 <6.1.0` : il
refuse TypeScript 7 par une garde inconditionnelle, au chargement du paquet, avant tout lint.
Sous TypeScript 7, `require('typescript')` ne rend que `{ version, versionMajorMinor }` — le
paquet n'expose pas d'API JavaScript — et la version majeure 7 fait tomber la garde.
`eslint-config-next` charge ce paquet ; `npm run lint` s'arrête donc avant le premier fichier.
C'est un refus délibéré, pas un défaut : l'erreur que le paquet lève renvoie à la page de
l'annonce décrivant le pont.

**Sa condition de sortie** est vérifiable sans date : que `typescript-eslint` accepte TypeScript
7. L'[issue #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) est
ouverte, sans jalon ni échéance ; le travail réel est la
[PR #12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803), encore en
brouillon.

**Aucune date ne remplace cette condition.** `typescript@next` est en `7.1.0-dev.…` : l'API
promise par l'annonce n'est pas publiée, et la garde ne couvre pas même les versions de
prépublication.

**La levée ne serait pas un gain.** Les bancs d'essai publiés pour #12803 mesurent
`recommendedTypeChecked` **1,13 à 1,56 fois plus lent** que TypeScript 6, pour 1,2 à 1,8 fois
sa mémoire — le pont IPC vers un processus `tsgo` séparé. Ce dépôt n'en profiterait pas :
`eslint-config-next` n'expose que `configs.recommended`, sans règle ayant besoin du
vérificateur de types, et son programme compte environ 3 700 fichiers.

Ce qui décide, au fond, n'est pas la version du compilateur mais la configuration du linteur.
Tant qu'aucune règle ne réclame le vérificateur de types, le pont n'a rien à offrir — et c'est
cela qu'il faudrait réexaminer le jour où une règle en réclame un.
