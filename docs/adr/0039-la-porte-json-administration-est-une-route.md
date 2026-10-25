# La porte JSON de l'Administration est une route, et les deux téléversements la traversent

Les deux routes JSON de mutation de l'Administration — la pré-signation et la libération d'un
**Brouillon d'Image produit** — portaient chacune sa copie de la même enveloppe : la **Session
courante** et le rôle, le parse du corps, le schéma, le Refus du domaine traduit en statut
HTTP, et le `catch` qui répond 500. `app/api/admin/uploads/presign/route.ts` et
`app/api/admin/uploads/delete/route.ts` se lisaient comme un paragraphe recopié : les mêmes 401,
400, statuts et 500, avec pour seule différence le schéma, l'appel au cycle de vie et le corps de
succès. Le `catch` répondait 500 sans un mot, donc une panne d'opération n'était pas diagnosable.

Les copies avaient déjà divergé. La suite de la pré-signation épinglait onze codes de Refus,
celle de la libération quatorze : `metadata-invalide`, `taille-invalide` et `trop-volumineux`
n'avaient pas de cas côté pré-signation. Le schéma de pré-signation réécrivait aussi la liste des
types MIME que le stockage possède déjà (`CONTENT_TYPES_IMAGE_PRODUIT`, `lib/r2.ts`) — la
troisième liste qu'ADR-0033 avait nommée, quand le stockage en est le propriétaire et que le cycle
de vie en dérive son prédicat. Une troisième route de téléversement aurait recopié l'enveloppe une
troisième fois ; une route qui aurait oublié la garde n'aurait été vue par aucune suite, parce que
l'enveloppe n'était pas un module avec une interface : c'était un paragraphe répété dans chaque
route.

[0025](0025-mutation-squelette-shared-mechanism.md) a montré, au rang des quatre modules de
mutation, qu'un mécanisme partagé peut posséder le squelette sans apprendre l'entité ni la base.
Le présent ADR étend ce raisonnement au rang de la route. [0033](0033-televersement-des-brouillons-un-port-client.md)
avait, lui, laissé les deux routes hors de sa décision et nommé leur liste MIME comme un
changement séparé ; ce travail prend cette liste différée, et le port client de téléversement
reste tel quel. Aucun terme n'est ajouté au glossaire.

## Décision

- **Ce travail prend la part qu'ADR-0033 avait différée.** [0033](0033-televersement-des-brouillons-un-port-client.md)
  a sorti le protocole de téléversement du composant et a laissé les deux routes « telles
  quelles », en nommant leur troisième liste de types MIME comme un changement séparé. Le présent
  ADR reprend l'enveloppe et cette liste ; il ne rouvre ni le port client, ni l'adaptateur HTTP,
  ni le composant de Galerie. L'invariant d'ADR-0033 — les routes ne changent pas sous *cette*
  décision — tient toujours : c'est une décision distincte qui les change, et leur contrat HTTP
  ne bouge pas.

- **Le raisonnement d'ADR-0025 change de rang, pas de nature.** [0025](0025-mutation-squelette-shared-mechanism.md)
  a partagé le squelette des mutations sans que le mécanisme apprenne une entité ou une base. La
  porte fait de même au rang de la route : elle possède l'enveloppe HTTP, pas le protocole de
  téléversement, ni le stockage, ni le registre, ni le cycle de vie. Elle n'importe ni `lib/r2.ts`,
  ni `lib/cycle-vie-image-produit.ts` ; elle reçoit un schéma et une opération, et ne nomme aucun
  de leurs gestes.

- **Un mécanisme au rang de la route, et administrateur seulement.** `adminJsonRoute` vit dans
  `lib/use-cases/admin-json-route.ts`. C'est le frère au rang de la route de `formAction` et
  `taskAction`, qui restent dans `lib/use-cases/mutation-actions.ts` : la porte n'agrandit pas le
  module d'actions, et les actions n'apprennent ni `Request` ni `Response`. Elle est
  administrateur seulement — pas de paramètre de garde — et n'est pas une couture JSON cliente ou
  publique : les seules routes JSON de mutation sont les deux téléversements, donc un paramètre de
  garde serait une couture avec un seul adaptateur. Un second type d'appelant justifierait de
  l'élargir ; rien ne le demande aujourd'hui.

- **La Session courante et le rôle se composent localement, sans nouveau symbole partagé.** La
  porte lit `lireSession` puis vérifie `estAdmin` en deux lignes privées.
  `lib/use-cases/session-courante.ts` ne gagne aucun `adminGate` : la **Session courante** ne
  refuse pas, elle répond le **Client** ou rien (ADR-0024), et le refus reste composé par la
  surface qui l'exige. Le module d'actions garde sa propre composition privée ; cette répétition
  de deux lignes n'est pas celle que ce travail supprime — c'est l'enveloppe de réponse qui était
  recopiée.

- **L'interface tient en cinq faits, et la route les déclare.** `adminJsonRoute` prend `schema`,
  `logLabel`, `failureMessage`, `statuses` et `run`, et rend
  `(request: Request) => Promise<Response>`. Le schéma est structurel (`safeParse`) : la porte
  n'importe pas Zod, et le langage du transport — le type de contenu et la taille de
  pré-signation, le corps strict de libération — reste dans le module de route. `logLabel` est le
  libellé de la ligne de journal du 500 — `[uploads] presign` ou `[uploads] delete` —,
  `failureMessage` est la copie 500 de la route — « Échec de la préparation du téléversement » ou
  « Échec de la libération du Brouillon d'Image produit » —, et `statuses` est la table de statuts
  du cycle de vie, `STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT`.

- **L'opération reçoit l'entrée analysée et le Client, et rend un résultat typé.**
  `run(input, client)` rend `{ ok: true; body }` ou `{ ok: false; code; message }`. Le **Client**
  est celui de la **Session courante** déjà lue : la route n'a pas de seconde lecture pour son
  `id`. `Code extends string` est générique sur `statuses: Record<Code, number>` : un code de
  Refus absent de la table de la route ne compile pas.

- **L'ordre de l'enveloppe est fixe, et sa copie aussi.** Dans cet ordre : session absente ou non
  administrative → 401 `{ error: "Non autorisé" }`, avant même la lecture du corps ; corps
  illisible → 400 `{ error: "Corps de requête invalide" }` ; corps qui échoue au schéma → 400
  `{ error: "Requête invalide" }`, sans jamais relayer les griefs de validation ; Refus de
  l'opération → le statut de `statuses[code]` avec `{ error: message }` ; succès → 200 avec le
  corps de l'opération ; opération qui lève → une seule ligne `console.error(logLabel, error)`, puis
  500 `{ error: failureMessage }`. Le succès est fixe à 200 : les deux routes répondaient déjà
  200, et aucune option de statut n'est ajoutée.

- **La 500 muette devient diagnosable, sans changer sa réponse.** L'ancienne enveloppe répondait
  500 sans journaliser ; la porte journalise une fois, avec le libellé de la route. La copie et le
  statut restent ceux d'avant : c'est le seul fait nouveau, et il ne change pas la réponse.

- **Les deux routes deviennent des déclarations.** `presign/route.ts` exporte
  `export const POST = adminJsonRoute({...})` et `delete/route.ts` exporte
  `export const DELETE = adminJsonRoute({...})` : la route ne construit aucune réponse et ne lit
  pas la session, elle déclare son schéma, son libellé, sa copie 500, sa table de statuts et son
  opération. Pas de wrapper autour de la porte : le wrapper est l'endroit où la garde peut se
  perdre.

- **La liste MIME a un seul propriétaire.** Le schéma de pré-signation dérive son énumération de
  `CONTENT_TYPES_IMAGE_PRODUIT` (`lib/r2.ts`), la liste que le stockage possède déjà et dont le
  cycle de vie dérive son prédicat. Ajouter un format est une édition dans `lib/r2.ts` ; le
  schéma, le cycle de vie et le stockage le lisent ensemble. La liste littérale de la route
  disparaît. La suite de frontière du cycle de vie,
  `lib/cycle-vie-image-produit-frontiere.test.ts`, inscrit la pré-signation sur la liste blanche
  des importateurs de `lib/r2.ts` pour ce seul vocabulaire : sa liaison nommée y est épinglée à
  `CONTENT_TYPES_IMAGE_PRODUIT`, et `getR2Client` comme `stockageImageProduitR2` lui restent
  interdits.

- **L'enveloppe a une seule suite ; les routes gardent leur langage.**
  `lib/use-cases/admin-json-route.test.ts` épingle, avec un schéma et une opération factices et en
  ne remplaçant que la **Session courante** : les 401 d'une session absente et d'une session non
  administrative, les 400 d'un corps illisible et d'un corps invalide, le 200 et son corps, les
  quatorze codes de Refus de la table, et la 500 journalisée une fois avec le bon libellé.
  Chaque suite de route garde son schéma et son opération — la pré-signation refuse un type
  non-image, la libération un corps strict qui refuse une clé étrangère —, un succès et un seul
  Refus de bout en bout. Les tableaux dupliqués de onze et quatorze codes quittent les routes.

- **La porte est non optionnelle.** `app/api/admin/uploads/frontiere.test.ts` lit les sources de
  production et nomme le contournement : une route surveillée qui importe ou lit la **Session
  courante**, vérifie le rôle, construit `Response.json(...)`, `new Response(...)` ou une variante
  `NextResponse`, cesse d'importer `adminJsonRoute`, ou n'exporte plus la valeur de la porte,
  échoue. La suite est non vacuant : elle voit les deux routes et ne signale rien sur le corpus
  réel, et des sources simulées prouvent qu'elle mord sur chaque forme. Une troisième route JSON
  d'Administration rejoint la liste surveillée.

- **Le contrat HTTP ne bouge pas.** Les chemins et méthodes
  (`POST /api/admin/uploads/presign`, `DELETE /api/admin/uploads/delete`), les corps de requête,
  les corps de succès — `{ draftId, uploadUrl, previewUrl, expiresAt }` et
  `{ released: true, draftId }` —, les statuts de Refus, la copie des 400 et 500 et le
  comportement de cache restent ceux d'avant. Les deux méthodes ne sont pas cacheables et le
  restent ; aucune réponse n'ajoute d'en-tête. Le port client de téléversement
  d'[0033](0033-televersement-des-brouillons-un-port-client.md), son adaptateur HTTP et le
  composant de Galerie ne changent pas.

## Options envisagées

- **Garder les deux enveloppes recopiées** — rejeté : les copies avaient déjà divergé (onze codes
  de Refus d'un côté, quatorze de l'autre), la troisième liste MIME qu'ADR-0033 avait nommée
  était recopiée dans le schéma de pré-signation, et une troisième route aurait recopié
  l'enveloppe une troisième fois. Aucune suite ne voyait une route qui oubliait la garde.
- **Élargir la porte en couture JSON cliente et publique** — rejeté : les seules routes JSON de
  mutation sont les deux téléversements ; une couture sans second appelant serait une abstraction
  pour un usage. Un second type d'appelant rouvrirait cette décision.
- **Importer l'`adminGate` privé du module d'actions** — rejeté : c'est un détail privé d'un autre
  mécanisme ; le rendre public aurait fait dépendre la porte de l'action et inversé le sens de la
  couture. La composition de deux lignes coûte moins que ce couplage.
- **Extraire un nouveau symbole d'administration partagé**, par exemple `adminGate` dans le module
  de session — rejeté : la **Session courante** ne refuse pas (ADR-0024) ; le refus reste composé
  par la surface qui l'exige, et deux compositions de deux lignes ne justifient pas un troisième
  nom exporté. Ce n'est pas la duplication que ce travail supprime.
- **Un statut de succès configurable** — rejeté : les deux routes répondent 200, un statut en
  option aurait ajouté un paramètre sans appelant et ouvert un contrat que rien ne demande.
- **Faire de chaque route un wrapper autour de la porte** — rejeté : le wrapper est l'endroit où
  la garde peut se perdre ; exporter la valeur de la porte fait de la route une déclaration, et la
  frontière peut l'exiger.
- **Déplacer les schémas dans la porte** — rejeté : le schéma est le langage du transport (type de
  contenu, taille, forme stricte du corps), la porte n'a pas à apprendre le téléversement.

## Invariants

- Toute route JSON de mutation de l'Administration traverse `adminJsonRoute` ; les deux routes
  surveillées échouent si elles lisent la **Session courante**, vérifient le rôle, construisent
  une réponse, cessent d'importer la porte ou n'exportent plus sa valeur — épinglé par
  `app/api/admin/uploads/frontiere.test.ts`.
- L'ordre et la copie de l'enveloppe sont uniques : 401 `Non autorisé` ; 400 `Corps de requête
  invalide` ; 400 `Requête invalide`, sans griefs de validation ; Refus au statut de la table
  de la route avec `{ error: message }` ; 200 fixe avec le corps ; une ligne
  `console.error(logLabel, error)` puis 500 avec la copie de la route.
- Le code de Refus est générique sur la table de statuts de la route ; un code sans statut ne
  compile pas.
- La table de statuts reste celle du cycle de vie, `STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT` ;
  aucun Refus, statut ou message n'est ajouté à ce vocabulaire.
- La liste MIME a un seul propriétaire, `CONTENT_TYPES_IMAGE_PRODUIT` dans `lib/r2.ts` ; le
  schéma de pré-signation en dérive, et ajouter un format est une édition dans ce module.
- `lib/use-cases/session-courante.ts` n'exporte pas de porte d'administration ; la composition
  `lireSession` + `estAdmin` reste locale à la porte, et privée dans le module d'actions.
- Le contrat HTTP est inchangé : chemins, méthodes, corps de requête, corps de succès, statuts de
  Refus, copies 400 et 500, et cache.
- Le port client de téléversement d'ADR-0033, son adaptateur HTTP et le composant de Galerie ne
  changent pas.
- La porte n'est ni une action, ni une couture JSON cliente ou publique ; un second type
  d'appelant rouvrirait cette décision.
- La porte n'importe ni le stockage, ni le registre, ni le cycle de vie ; elle reçoit un schéma,
  un libellé, une copie 500, une table de statuts et une opération, et ne connaît aucun de leurs
  gestes.
- Les deux modules de route restent des déclarations : `export const POST`/`DELETE =
  adminJsonRoute(...)`, et aucune construction de réponse.
