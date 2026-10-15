# Le téléversement des Brouillons d'Image produit quitte le composant, le protocole a son port

`ImageGalleryUpload` portait tout le protocole de téléversement : la pré-signature POST, l'envoi
PUT vers le stockage, la libération DELETE, la validation de la forme des réponses, la boucle par
fichier, le plafond recopié et le choix des mots de chaque échec. Sa suite — huit tests sous
happy-dom — ne l'atteignait qu'en remplaçant `fetch`, et une panne réseau faisait avorter le lot
sans un mot, parce que la boucle n'avait pas de `catch`. Le plafond `8` avait deux propriétaires :
`MAX_FILES` dans le composant et une constante privée de la validation Catalogue. Les refus du
domaine sont déjà mot à mot au serveur, dans le cycle de vie d'ADR-0004 ; le transport, lui,
n'avait pas de maison.

## Décision

- **Deux gestes, pas un client HTTP.** `components/admin/televersement-brouillons.ts` expose
  `ajouter(fichiers, places)` et `relacher(draftId)`. Le module possède la boucle par fichier,
  l'ordre, la continuation après refus et la règle du dernier message ; le composant possède
  l'état React (`uploading`, `releasingDraftId`, `error`), la fusion dans la galerie et le rendu.
  `places` vient de l'appelant : c'est le composant qui tient le registre des « Suppressions en
  attente », le module ne compte pas.
- **Le port refuse, il ne lève pas.** `PortTeleversementBrouillons` (`presigner`, `envoyer`,
  `relacher`) rend des verdicts `{ ok }`. L'adaptateur attrape les pannes réseau et les rend en
  refus ; le module n'a aucun `catch` défensif, et un lot survit désormais à une panne : les
  fichiers déjà acceptés restent, le message s'affiche. C'est un changement de comportement
  assumé — l'ancien avortait le lot en silence.
- **La langue des refus est partagée en trois, sans recouvrement.** Le serveur dit les refus du
  domaine et son message est relayé verbatim dans l'enveloppe `{ error }` (ADR-0004) ; l'adaptateur
  dit les échecs HTTP — statut, corps illisible, enveloppe de pré-signature invalide, panne — ; le
  module dit le seul refus de type non-image. Aucun des trois ne réécrit les mots d'un autre.
- **Le plafond a un seul propriétaire.** `LIMITE_IMAGES_PRODUIT` vit dans
  `lib/galerie-image-produit.ts`, le vocabulaire neutre de la Galerie d'images produit, et la
  validation du Catalogue d'Administration comme le composant le lisent. Le module reçoit des
  places, il ne connaît pas la limite.
- **L'adaptateur est la seule bouche HTTP.** `components/admin/televersement-brouillons-http.ts`
  est le seul appelant des deux routes `/api/admin/uploads/*`, qui ne bougent pas — leur troisième
  liste de types MIME est un changement séparé. Le défaut se compose au bord : le module exporte
  une instance composée sur l'adaptateur, et le composant la reçoit par prop optionnelle
  (`televersement?`), couture cliente d'ADR-0014 et ADR-0018.

## Options envisagées

- **Un client HTTP mince, sans gestes** — rejeté : la boucle, le plafond et la continuation sont
  le protocole ; un client mince les aurait laissés dans le composant.
- **Un hook React** — rejeté : les trois états du composant sont les siens, un hook aurait mis le
  protocole dans React ; le module est un module simple, sans `"use client"`.
- **Valider la forme de la réponse côté module** — rejeté : la forme d'enveloppe est le contrat de
  l'adaptateur avec la route.
- **Un `catch` défensif dans le module** — rejeté : le contrat du port est le refus, pas le
  lancer ; une ceinture-bretelles masquerait un port infidèle.
- **Faire traverser au composant le vrai module posé sur le faux port** — rejeté : les domaines de
  panne se brouilleraient. Le composant reçoit un faux *transport* fait main ; le module et
  l'adaptateur ont leurs suites, le second en remplaçant `fetch` (le jumeau en mémoire
  `test/televersement-brouillons-memoire.ts` suit `test/port-mutations-du-panier.ts`).
- **Tronquer bruyamment une sélection au-delà des places** — différé : la troncature reste
  silencieuse, et elle est nommée comme suite.
- **Supprimer la liste MIME des routes** — hors périmètre : elle est le doublon du cycle de vie,
  pas du protocole client.

## Invariants

- Le composant ne parle plus HTTP : ni `fetch`, ni `/api/admin/uploads`, ni forme de corps —
  épinglé par `lib/cycle-vie-image-produit-frontiere.test.ts`.
- Une seule bouche par route : seul l'adaptateur nomme `/api/admin/uploads/presign` et
  `/api/admin/uploads/delete`.
- Le port refuse, il ne lève jamais ; le module n'importe ni React, ni le serveur, et n'atteint ni
  `lib/r2.ts` ni `lib/cycle-vie-image-produit.ts`.
- `LIMITE_IMAGES_PRODUIT` n'a qu'un propriétaire, `lib/galerie-image-produit.ts`.
- Les refus du domaine restent mot à mot au serveur ; le client ne les réécrit pas.
- `product-form.tsx` et les deux routes ne changent pas sous cette décision.
