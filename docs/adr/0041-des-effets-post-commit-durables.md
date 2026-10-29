# Les effets post-commit deviennent des automatisations durables, réclamées en `SKIP LOCKED`

[0014](0014-encapsulated-domain-mutation-effects.md) a fait d'un effet une fonction que la mutation
possède et qu'elle exécute après son commit, dans un `try/catch` qui ne journalise qu'un
`console.warn`. C'était le bon compromis tant que le seul coût d'un effet perdu était une ligne de
journal : le commit reste autoritatif, l'e-mail de confirmation ne bloque pas la Commande, et le
catalogue ne s'arrête pas quand Meilisearch tombe. Le coût réel est ailleurs. Une confirmation de
Commande perdue ne laisse aucune trace sinon un avertissement noyé dans les logs du conteneur ; une
réindexation ratée n'a pas de reprise ; un e-mail de statut manqué n'a pas de bouton « rejouer » ; et
rien, dans l'Administration, ne dit qu'un effet a échoué. Le même ADR nommait la sortie —
« Outbox / background worker » — et l'a différée. Le présent ADR la prend.

La mesure existait déjà depuis la phase 0 de la spec #804 : `runEffect` et `runOrderedEffects`
portent un `JournalEffetsPostCommit` qui reçoit `{ effet, entite, resultat, dureeMs, message,
erreur? }`. C'est la forme d'une ligne d'exécution, pas encore une mémoire. Il manquait le
déclencheur durable, la trace en base, la reprise et la file morte. Il manquait aussi que l'écriture
de l'événement soit **dans la transaction de la mutation** : une ligne ajoutée après le commit est le
double écrit que l'outbox existe pour supprimer.

Le présent ADR **remplace exactement un invariant d'ADR-0014** : « No schema change, no queues/outbox ».
Rien d'autre. Les types `*Effects`, leurs adaptateurs de production, la surcharge partielle par les
appelants, la frontière best-effort des effets non critiques et la propriété de chaque module sur son
vocabulaire de refus restent tels quels. ADR-0025 n'est pas touché non plus : `runEffect` reste dans
`lib/use-cases/mutation-squelette.ts`, le mécanisme n'apprend ni entité ni base, et les quatre suites
d'entité restent quatre. La seule chose qui cesse d'être vraie est la phrase qui interdisait la file
et l'outbox.

## Décision

- **L'outbox est dans la transaction de la mutation.** `AutomationEvent`
  (`prisma/schema.prisma`, migration `20261028190000_automatisations_durables`) porte le `type`,
  `entityType`, `entityId`, une `payload` JSON **immuable**, `occurredAt`, `expiresAt`, une `seq`
  par entité, une clé naturelle `attemptOf`, et l'état de consommation (`status`, `attempts`,
  `lastError`, `availableAt`, `lockedUntil`). `enregistrerEvenement(tx, …)`
  (`lib/automations/evenements.ts`) l'écrit avec le client de la transaction qui produit le fait :
  `placeOrder` et `updateOrderStatus` (`lib/use-cases/orders.ts`), `enregistrerProduit`,
  `deleteProduct` et `updateVariantStock` (`lib/use-cases/admin-catalog.ts`), et les trois mutations
  de Structure sous `sousVerrouDeStructure` (`lib/use-cases/admin-structure.ts`). Un retour arrière
  ne laisse ni événement ni exécution. `deleteProduct` et `updateVariantStock`, qui écrivaient hors
  transaction, en ouvrent une — c'est le prix de l'atomicité, et il est nommé ici.

- **`AutomationRun` est la mesure de la phase 0 promue en mémoire.** Une ligne par couple
  (événement, règle, tentative) : `status` (`en_cours`, `reussi`, `echoue`, `ignore`), `attempt`,
  `lastError`, `startedAt`/`finishedAt`, `durationMs`, et `trigger` (`evenement`, `planification`,
  `manuel`, ce dernier appartenant à la phase 5). La forme reprend `MesureEffetPostCommit` : on ne
  réinvente pas un journal, on lui donne une adresse.

- **Les règles sont un vocabulaire fermé, semé dans le code.** `AutomationRule` porte `trigger`,
  `condition` JSON, `action`, `enabled` ; `AutomationRuleRevision` conserve l'instantané, l'auteur et
  l'horodatage de chaque changement. Les valeurs de `trigger` sont exactement
  `TYPES_EVENEMENT_AUTOMATION` et celles d'`action` exactement `ACTIONS_AUTOMATION`
  (`lib/automations/regles.ts`), validées par Zod au semis comme à l'exécution. Aucune condition
  n'est un prédicat libre : `toujours` ou `statut-commande`. `semerLesRegles` est idempotent et ne
  crée une révision que si l'instantané change — il est appelé par `prisma/seed.ts` et au démarrage
  du travailleur. Phase 5 possédera l'éditeur ; la table est déjà sa réserve.

- **Le travailleur tient sur le Postgres déjà déployé.** pg-boss 12.38.0 (MIT) est la seule
  dépendance ajoutée ; il n'y a ni Redis, ni second conteneur, ni second fournisseur. Il est démarré
  depuis `instrumentation.register` (`instrumentation.ts`) dans une promesse **jamais attendue** :
  `register` est appelé une fois au démarrage du serveur et doit rendre la main. Il ne démarre ni
  pendant le build, ni sous Vitest. pg-boss porte la boucle (un balayage par minute), les deux
  horaires (réconciliation à 03 h, digest à 07 h, fuseau `Africa/Casablanca`) et sa propre file
  morte de travaux. L'unité durable reste l'événement de `AutomationEvent` ; plusieurs réplicas
  peuvent lancer la boucle.

- **La réclamation est un `SELECT … FOR UPDATE SKIP LOCKED` sur la tête de chaque entité.**
  `reclamerLesIdentifiants` (`lib/automations/executeur.ts`) ne rend que l'événement de plus petite
  `seq` non terminal d'une entité : deux travailleurs se partagent des entités, jamais un événement,
  et l'ordre d'une entité est une propriété du SQL, pas une convention. Le verrou est tenu le temps
  de la transaction de réclamation ; l'exécution est protégée par `status = en_cours` et un bail
  `lockedUntil`. Un processus tué laisse le bail expirer, et le balayage suivant reprend l'événement
  — c'est le « tuer le conteneur et redémarrer » de l'acceptation, sans mécanisme supplémentaire.

- **Reprise avec backoff, file morte avec renvoi.** Une action qui échoue laisse une exécution
  `echoue` avec son message, remet l'événement en attente et repousse `availableAt` d'un délai
  exponentiel borné à une heure (1 min, 2 min, 4 min…). À la troisième tentative, l'événement passe
  `mort` avec sa dernière erreur : c'est la file morte du domaine, lisible et rejouable par
  `redriveEvenementsMorts`. Un événement dont `expiresAt` est dépassé n'exécute **jamais** son
  action : il passe `ignore`, avec une exécution `ignore` qui dit « événement expiré » — ignoré
  n'est pas échoué, et le journal ne confond pas les deux.

- **L'idempotence a deux étages.** La clé naturelle `(type, entityId, attemptOf)` est un index
  unique : un écrivain qui rejoue un fait — le planificateur d'une journée, par exemple — ne crée
  pas de doublon, `enregistrerEvenementSiAbsent` avalant la seule violation de cette clé. Et chaque
  e-mail de Commande porte une clé d'idempotence de fournisseur dérivée du fait —
  `commande.creee/<orderId>/1` ou `commande.statut/<orderId>/<statut>` (`lib/emails.ts`) — la même
  que l'envoi immédiat après le commit et que le rejeu par le travailleur. Resend la mémorise 24 h,
  exactement la durée de vie par défaut d'un événement : au-delà, on ne rejoue pas, on ignore. Une
  seconde livraison du même événement n'envoie donc pas un second e-mail.

- **Les actions enveloppent ce qui existe déjà.** Les e-mails de Commande (`lib/emails.ts`), l'index
  et le retrait d'index (`indexProductDocuments`, `deleteProductDocument`), la purge du bord
  (`demandeDePurgeCatalogue`, adaptateur Cloudflare) et l'invalidation du cache
  (`revaliderCatalogue`, `invalidateStructure`) n'ont pas été réécrits : l'action les nomme. Les deux
  moitiés de `invalidateCatalogue` ont seulement été séparées — le cache Next d'un côté, le bord de
  l'autre — pour que deux règles puissent les traiter séparément, sans changer le comportement de la
  porte unique. Aucune action n'a été ajoutée sans une règle semée qui la nomme ; il n'y a ni code
  arbitraire, ni URL libre, ni fan-out non borné, ni secret dans une règle.

- **v0 : deux tâches quotidiennes et un digest optionnel, sans nouvelle infrastructure.**
  `planifierLeDigestStockBas` et `planifierLaReconciliation` (`lib/automations/planification.ts`)
  écrivent les événements du jour avec `entityId = <YYYY-MM-DD>` et `attemptOf = 1` : la clé
  naturelle rend la journée idempotente, et l'horloge est injectée dans les tests. Le digest réutilise
  `LOW_STOCK_THRESHOLD` et la requête du Tableau de bord ; sa projection (`lib/automations/digests.ts`)
  est pure et triée en français, donc stable pour une même fenêtre. La réconciliation compare la base
  et l'index par `id` et `updatedAt` : elle réécrit les documents absents ou périmés, retire les
  orphelins, et son rapport est trié — le second passage d'une journée ne trouve plus rien. Le digest
  du propriétaire est une règle semée mais **désactivée** : elle est là, elle n'envoie rien tant que
  personne ne l'active, et Phase 5 en fera une case.

- **La publication programmée n'est pas un travail.** Le défaut d'horloge que la phase 0 a corrigé
  reste une prédicat de lecture sur `ArticleBlog.publishedAt` ; le présent ADR n'ajoute aucun job de
  publication, et l'expiration d'un événement n'est pas une horloge déguisée.

- **La surface est minimale, et Phase 5 la possède.** `listerExecutions`
  (`lib/automations/historique.ts`) rend les dernières exécutions avec statut, tentative, erreur et
  horodatages, et `app/admin/automatisations/page.tsx` les montre ; une exécution en échec y est
  visible avec son erreur et son nombre de tentatives. La relance manuelle, l'édition des règles et
  la simulation appartiennent à Phase 5, et les modèles sont déjà taillés pour elle.

## Options envisagées

- **Garder le journal console et se contenter de la mesure de la phase 0** — rejeté : c'est l'état
  actuel, sans reprise, sans mémoire et sans visibilité ; une confirmation perdue reste invisible,
  ce qui est précisément le défaut que l'ADR corrige.
- **BullMQ sur le Redis déjà présent** — rejeté : Redis ici est un cache de rendu et un limiteur,
  tous deux reconstructibles ; écrire dans Redis après le commit est le double écrit que l'outbox
  supprime, et `repeat` a disparu de BullMQ v6.
- **Prendre pg-boss pour la file de référence et supprimer `AutomationEvent`** — rejeté : la ligne
  doit être écrite dans la transaction de la mutation, par le client Prisma de cette transaction ;
  pg-boss est un excellent travailleur, pas la mémoire du fait. La table d'outbox est le contrat,
  pg-boss la boucle.
- **Un conteneur de travail séparé, ou `after()`** — rejeté pour l'un comme pour l'autre : `after`
  n'a ni durabilité, ni reprise, ni mémoire, et sa durée est celle de la requête plus une vidange de
  10 à 30 s ; un second conteneur ajoute une plateforme à exploiter, alors que le Postgres est déjà
  là et que le worker tient dans le même processus.
- **Inngest, Trigger.dev, Temporal, n8n** — rejetés : un second ordonnanceur, un second tableau de
  bord et une seconde réponse à « qu'est-ce qui a tourné ? » ; Trigger.dev construirait en plus son
  propre image de notre code.
- **Des règles écrites par le marchand, en JavaScript ou en URL libre** — rejetées : eGuidar n'a pas
  de bac à sable, et un `fetch` libre dans une règle est une exfiltration en attente. Le vocabulaire
  reste fermé, et une valeur inconnue est un refus, pas une exécution.
- **Écrire `runEffect` en base plutôt que d'ajouter une table** — rejeté : le journal de la phase 0
  n'a ni déclencheur, ni entité durable, ni reprise ; le promouvoir en `AutomationRun` suffit, et il
  garde sa frontière best-effort pour les effets non critiques.

## Invariants

- L'insertion de l'outbox est dans la transaction de la mutation : un retour arrière ne laisse ni
  événement ni exécution — épinglé par `lib/automations/evenements.test.ts` et
  `lib/automations/evenements-mutations.test.ts`.
- `payload` ne change jamais après l'écriture ; le travailleur lit, il ne réécrit pas le fait.
- La réclamation ne rend qu'une tête d'entité, en `FOR UPDATE SKIP LOCKED` ; deux travailleurs ne
  réclament pas le même événement — épinglé par `lib/automations/executeur.test.ts`.
- Un événement expiré est `ignore`, jamais `echoue` ; un événement épuisé est `mort` avec sa dernière
  erreur et se renvoie — épinglé par la même suite.
- Une exécution porte un statut, une tentative, une erreur et des horodatages, et un échec est
  visible dans l'Administration — épinglé par `lib/automations/executeur.test.ts` et
  `app/admin/automatisations/page.test.tsx`.
- Les deux étages d'idempotence tiennent : la clé naturelle `(type, entityId, attemptOf)` et la clé
  de fournisseur, la même pour l'envoi immédiat et le rejeu — épinglé par
  `lib/automations/executeur.test.ts`.
- Aucune écriture Redis entre le commit et son effet, aucun second conteneur : pg-boss tourne sur le
  Postgres existant — épinglé par `lib/automations/file.test.ts`.
- Le vocabulaire des déclencheurs, conditions et actions reste fermé et semé dans le code — épinglé
  par `lib/automations/regles.test.ts`.
- ADR-0014 tient pour le reste : les ports `*Effects`, les adaptateurs injectés, la surcharge
  partielle, la frontière best-effort des effets non critiques et le commit autoritatif ne changent
  pas. ADR-0025 tient entièrement : `runEffect` n'apprend ni entité ni base, et les quatre suites
  restent quatre.
- La publication programmée reste un prédicat de lecture ; le présent ADR n'ajoute aucun job pour
  elle.

## Ce que cet ADR rend faux

- ADR-0014, « Invariants », dernier point : « No schema change, no queues/outbox. » — remplacé par la
  présente décision, et par elle seule. Les autres points de la même liste restent vrais.
- ADR-0014, « Options envisagées », « Outbox / background worker — différé » : la sortie différée est
  prise ici.

## Addendum — la surface des Règles, phase 5

La phase 4 avait taillé les modèles et laissé le marchand devant une page de lecture seule. La
phase 5 ouvre l'édition **dans le vocabulaire fermé** : elle n'ajoute ni déclencheur, ni condition,
ni action, et elle ne touche pas au travailleur. Ce qu'elle ajoute, ce sont les gardes et les gestes
qui manquaient.

- **Le propriétaire est le rôle `admin`.** Le dépôt n'a qu'un modèle de rôles (`"admin"` ou
  `"user"`, `estAdmin`) : « le propriétaire » est donc l'administrateur semé, et la bascule passe par
  `adminFormAction`, exactement la garde de l'Administration. Toute session de l'Administration lit
  la liste, l'éditeur, la simulation et l'historique — c'est la garde de `app/admin/layout.tsx` qui
  l'assure — mais seule une session `estAdmin` peut créer, modifier, basculer ou réessayer. Un modèle
  multi-rôles pourra resserrer cette garde sans changer les modèles : rien ne dépend d'un rôle nommé
  au-delà de `estAdmin`.

- **Le vocabulaire reste fermé, et une combinaison impossible se refuse en la nommant.**
  `lib/automations/vocabulaire.ts` porte la table de compatibilité déclencheur → action
  (`DECLENCHEURS_PAR_ACTION`), les conditions admises par déclencheur (`statut-commande` n'a de sens
  que sur `commande.statut.changee`, dont la charge porte ce champ), et la table des entités que
  chaque action écrit (`ENTITES_ECRITES_PAR_ACTION`, vide aujourd'hui — la frontière du travailleur
  interdit déjà les modules de mutation). `actionsOffertes` filtre les actions qui écriraient la table
  observée par leur propre déclencheur : une boucle ne peut donc pas être exprimée, plutôt que d'être
  détectée après coup. Le refus est un `CombinaisonRefusee`, un `UserFacingError` dont le message
  nomme les deux valeurs et leurs libellés : « Combinaison non prise en charge : « Produit
  enregistré » (produit.enregistre) ne déclenche pas « E-mail de statut de Commande »
  (email.commande-statut). » Le module est pur : le formulaire client et l'éditeur serveur lisent la
  même liste.

- **L'éditeur écrit une révision attribuée, jamais une révision vide.** L'identifiant d'une règle
  créée est dérivé de son nom (`slugify`), puisqu'il est la clé que l'historique des exécutions
  référence ; un identifiant déjà pris est refusé en le nommant. `ecrireRevisionRegle` compare
  l'instantané stable (mêmes clés, triées) à la dernière révision : un enregistrement qui ne change
  rien n'ajoute pas d'audit, et le semis d'un redéploiement non plus. Chaque révision porte
  l'instantané complet, `caller.email` comme auteur et l'horodatage.

- **Basculer prend effet au balayage suivant, sans redéploiement.** L'exécuteur lit `enabled` en base
  à chaque passe : il n'y a ni cache de règle ni redémarrage. Désactiver annule les exécutions en
  cours de la règle (`en_cours` → `ignore`, motif « annulée : règle désactivée ») et libère le bail
  de leur Événement. Réactiver ne rejoue rien : les Événements arrivés pendant la désactivation ont
  déjà été consommés par le balayage (un Événement dont aucune règle ne s'applique est `reussi`, pas
  en attente). L'acceptation « désactiver puis réactiver n'envoie pas deux fois » tient donc par la
  consommation, pas par une file de rejeu.

- **La simulation juge sur un Événement réel et ne peut rien écrire.** `simulerRegle` lit la règle et
  un `AutomationEvent` existant, puis rend `enverrait` ou `ignorerait` avec le motif : déclencheur
  différent, règle désactivée, Événement expiré, condition non remplie (le statut est nommé), ou
  condition remplie. Elle **ne prend pas les ports du travailleur** : elle ne peut donc ni envoyer ni
  écrire une Exécution, et le test l'épingle en comptant les Exécutions et en laissant les ports
  mémoire intacts. La page choisit le dernier Événement du déclencheur par défaut, et `?simuler=<id>`
  en choisit un autre — c'est une lecture, pas une action.

- **L'historique se filtre et se réessaie.** `listerExecutions` prend un statut, une règle et une
  date de départ (même grammaire d'URL que la liste des Commandes : parse, rebuild, valeur inconnue
  ignorée), rend `regleId` et les horodatages, et `compterExecutionsEnEchec` alimente le bandeau.
  `reessayerExecution` ne réessaie qu'une Exécution `echoue`, rejoue **la règle** sur l'Événement de
  l'Exécution, écrit une nouvelle Exécution `manuel` avec la tentative suivante et laisse l'échec
  d'origine dans l'histoire. L'Événement ne redevient `reussi` que si aucune autre règle n'a encore sa
  dernière Exécution en échec — un réessai ne masque pas l'échec du voisin. C'est la distinction
  « manual retry » de Flow et « manuel contre production » de n8n.

- **La rétention est celle de l'historique, et c'est le même balayage.** Flow documente 14 jours :
  `DUREE_RETENTION_EXECUTIONS_MS` vaut quatorze jours et `prunerLesExecutions` supprime les Exécutions
  terminées dont le début sort de la fenêtre. L'appel est dans `balayer`, à côté de
  `executerLesEvenements` : pas de seconde tâche planifiée, pas de second ordonnanceur. Une Exécution
  `en_cours` n'est jamais purgée — elle porte le bail d'un Événement.

- **Un secret est un nom, jamais une valeur.** Le seul secret du vocabulaire est le destinataire d'un
  digest : `actionConfig` ne stocke que `{ "destinataireVariable": "ADMIN_EMAIL" }`, validé par une
  expression qui n'admet que des majuscules, des chiffres et « _ » (une URL ou une adresse est donc
  refusée). La valeur est lue par `process.env[nom]` à l'exécution, et une variable absente ou
  invalide produit une erreur qui nomme la variable **sans sa valeur** ; l'instantané de révision, la
  liste, l'éditeur et l'historique n'affichent que le nom. Aucun champ de règle n'admet de code, d'URL
  ou de texte libre au-delà du nom de la règle.

- **« Exécuter maintenant » n'est pas offert.** Le vocabulaire ne le permet pas sans second
  écrivain : les actions lisent toutes la charge d'un Événement, et l'invariant « l'outbox est écrit
  dans la transaction de la mutation » interdit de fabriquer un Événement depuis un bouton. Le réessai
  manuel couvre le besoin réel (« rejouer cette action qui a échoué ») ; le reste attend le prochain
  balayage.

- Ce que l'addendum épingle, en plus des invariants de la phase 4 :
  `lib/automations/vocabulaire.test.ts` (offre par déclencheur, combinaison refusée nommée, boucle
  impossible, nom de variable), `lib/use-cases/automatisations.test.ts` (création et révision
  attribuée, refus, bascule et annulation, pas de rejeu, simulation sans écriture, réessai manuel),
  `lib/automations/historique.test.ts` (filtres), `lib/automations/retention.test.ts` (fenêtre et
  purge par `balayer`), `app/admin/automatisations/**/*.test.tsx` (la liste, l'éditeur, la
  simulation, l'historique et le refus d'une session non propriétaire).
