# Une copie vendue de `braces` porte la garde de profondeur

L'alerte Dependabot #53 — [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
CVE-2026-93687, CWE-674 — déclare `braces` vulnérable jusqu'à `3.0.3` comprise, et
`first_patched_version` est `null` : `3.0.3` est toujours la dernière publication du
registre, et l'issue amont [micromatch/braces#70](https://github.com/micromatch/braces/issues/70)
reste ouverte. `parse()` borne la longueur de son entrée (`MAX_LENGTH = 10000`) mais
jamais la profondeur d'imbrication de la pile de blocs qu'il construit, et `compile()`,
`expand()` et `stringify()` descendent cet arbre récursivement, un cadre de pile par
niveau. Un motif bien sous le plafond de caractères — 4 000 accolades emboîtées font
8 001 caractères — lève `RangeError: Maximum call stack size exceeded`, et personne ne
l'attrape : le processus Node meurt. Les parenthèses emboîtées atteignent le même
puis, `parse()` empilant un bloc pour chacune.

Le dépôt n'atteint `braces` que par des outils de développement :
`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` →
`braces`, et `shadcn` → `fast-glob`/`ts-morph` → `micromatch` → `braces`. Le ticket
précédent (#538) avait déjà fait sortir `shadcn` des dépendances de production et
ajouté une garde ; ce qui restait était un risque de développement, accepté en attendant
que le registre publie un correctif.

## Décision

- **Le graphe porte sa propre copie.** `vendor/braces/` est `3.0.3` avec une garde de
  profondeur dans `parse()`, et rien d'autre : `index.js`, `LICENSE` et les autres
  fichiers de `lib/` sont octet pour octet ceux d'amont, ce que
  [`vendor/braces/README.md`](../../vendor/braces/README.md) établit par diff.
- **La copie est une dépendance de développement, et chaque demandeur y est ramené.**
  `package.json` déclare `"braces": "file:vendor/braces"` et
  `"overrides": { "braces": "$braces" }` : `node_modules/braces` est un lien vers la
  copie, et le lockfile ne contient aucune publication du registre.
- **La copie déclare une version au-dessus de `3.0.3`.** L'avis couvre `<= 3.0.3`,
  et un prerelease de `3.0.3` se lit *en dessous* de `3.0.3` dans l'outil qui
  l'évalue — Dependabot compris : `3.0.3-patched.0` resterait dans la plage et
  l'alerte resterait ouverte. `3.0.4-patched.0` en est sorti sous les deux lectures
  de la précédence, et dit encore ce qu'il est : le prochain niveau de
  correction, patché localement.
- **La borne est une constante du paquet, pas une option de l'appelant.** `MAX_DEPTH`
  vaut 100, et `options.maxDepth` la suit comme `options.maxLength` suit `MAX_LENGTH` :
  un appelant peut la baisser, jamais la lever au-delà de la garde du paquet.
- **L'image porte la copie avant son installation.** `Dockerfile` copie `vendor/` avant
  `npm ci` dans l'étape `deps`, et une garde l'exige : la CI ne construit pas l'image,
  seul le déploiement le fait.

## Ce que la mesure établ

**Aucune version du registre n'est installée, et la copie vendue refuse la profondeur au
lieu d'épuiser la pile.** Le témoin de `braces-patch.test.ts` fait tomber la version du
registre sur cette machine — 4 000 accolades emboîtées, 4 000 parenthèses emboîtées, sur
`compile`, `expand` et `stringify`, les trois parcoureurs que l'avis nomme — et rend
`SyntaxError` sur les six cas avec la copie vendue. La garde se pose là où la pile
grandit, non en tête de boucle : une entrée qui ouvre plus de blocs qu'elle n'en ferme
ne revient jamais à cette boucle avant que les parcoureurs ne tournent.

**Les motifs ordinaires passent toujours.** La profondeur est bornée, non le nombre de
caractères : `micromatch` et `fast-glob` nourrissent cette copie de motifs écrits par ce
dépôt, et aucun n'imbrique à cent niveaux. `npm run lint` — qui fait tourner
`@next/eslint-plugin-next`, donc `fast-glob`, donc `micromatch` — et le CLI `shadcn`
sont les preuves de bout en bout.

**Le paquet livré reste hors du graphe de production.** Aucune dépendance de production
n'atteint `braces`, et chaque copie est atteinte par le développement : la fermeture de
production établie par #538 n'a pas bougé.

## Conséquences

- **L'alerte se ferme par correction du graphe**, comme le veut la convention du dépôt :
  une alerte Dependabot ne se clôt pas par un refus, et un plancher de version ne peut
  pas être épinglé ici — toute version que le registre offre est la vulnérable.
- **La copie doit être re-diffée contre amont dès qu'un correctif paraît.** Le jour où
  le registre publie une version corrigée, `vendor/braces/` disparaît au profit d'un
  plancher, et `braces-patch.test.ts` prend la forme des autres gardes du dépôt. Tant
  que ce n'est pas le cas, la divergence est la seule chose qui tue l'avis.
- **La borne 100 est un contrat écrit dans le test, non lue dans le fichier vendu.**
  Une borne lue à sa source la suivrait partout, et un `MAX_DEPTH` levé à 10 000
  laisserait la garde verte.
- **Le dossier vendu reste sous le linter.** `.gitignore` ne l'ignore pas et
  `eslint-ignores.test.ts` veut que le linter voie tout ce que git suit : seule la règle
  `@typescript-eslint/no-require-imports`, qui ne peut pas s'appliquer à du CommonJS
  d'amont, est éteinte sur `vendor/**/*.js`.

## Ce que la mesure ne change pas

- **Le graphe de production.** `braces` n'y était pas et n'y est toujours pas ; ce qui
  change, c'est que la copie de développement n'est plus celle de l'avis.
- **Le code d'amont.** La copie vendue garde les siens, `console.log` de débogage de
  `compile.js` compris : la divergence est la garde, et l'ajouter la rendrait plus
  large que la décision.
- **Les outils qui atteignent le paquet.** `eslint-config-next` et `shadcn` restent en
  place ; la correction tient au paquet qu'ils reçoivent, non à leur suppression.

*Mesures citées à l'alerte Dependabot #53 et à
[`braces-patch.test.ts`](../../braces-patch.test.ts).*
