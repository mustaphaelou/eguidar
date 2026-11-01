# Le compteur d'échecs d'une Connexion est tenu par adresse normalisée, dans Redis

Le limiteur de Better Auth compte par adresse et par chemin, jamais par compte :
un attaquant qui dispose de plusieurs adresses obtient un budget illimité contre
un seul Compte client. NIST SP 800-63B-4 §3.2.2 demande de borner les échecs
consécutifs sur un compte ; ASVS 6.1.1 exige en plus que le verrou ne devienne
pas un déni de service. Le magasin Redis existe déjà (limiteur de Recherche), et
il survit au redémarrage d'un conteneur, contrairement à la mémoire du limiteur
par adresse.

## Décision

- **Dix échecs consécutifs pour une adresse, pendant quinze minutes.** La clé
  est l'adresse normalisée (espaces retirés, minuscules), lue dans Redis avec un
  TTL de `FENETRE_ECHEANCES_CONNEXION_MS`. Le seuil et la fenêtre sont des
  constantes nommées dans `lib/echecs-connexion-regles.ts`. L'adresse est celle
  qui est saisie : une adresse inconnue est comptée comme une autre, donc le
  compteur ne révèle pas l'existence d'un Compte client.
- **Le compteur est incrémenté par un `hooks.after` sur `/sign-in/email`**, quand
  la bibliothèque rend `INVALID_EMAIL_OR_PASSWORD` ; toute réponse non-erreur le
  supprime. Le compteur ne s'incrémente donc jamais sur un mot de passe correct,
  et la Connexion réussie remet le budget à zéro.
- **Le refus est un `hooks.before`**, avant toute vérification du mot de passe,
  et rend `429 ACCOUNT_TEMPORARILY_LOCKED` avec un message distinct d'un mauvais
  mot de passe. Le Client attend ; il n'apprend pas si le compte existe, puisque
  la clé est l'adresse saisie, connue ou non.
- **Le verrou s'efface tout seul, et il est court.** La fenêtre part du dernier
  échec compté : après le dixième, le refus dure quinze minutes, puis la clé
  expire. Un refus ne prolonge pas la fenêtre, puisqu'un refus ne compte pas.
  La prévention du déni de service est bornée, pas absolue : un attaquant qui
  continue d'échouer peut maintenir une adresse connue fermée, mais l'état est
  volatil (TTL), ne survit pas à l'arrêt de l'attaque, et le limiteur par
  adresse reste la première ligne. Rendre le verrou permanent serait le déni de
  service que cette décision refuse.
- **Le limiteur par adresse ne change pas.** Il reste la première ligne, avec sa
  fenêtre et son magasin actuels ; le compteur par compte est une seconde ligne
  orthogonale.
- **Redis indisponible ne ferme pas la Connexion.** Le compteur est une seconde
  ligne : une panne du magasin laisse passer la tentative, et le limiteur par
  adresse continue. Refuser tout le monde parce qu'un compteur secondaire est
  absent serait le déni de service que cette décision cherche à éviter.

## Options envisagées

- **Compter dans la mémoire du processus** — rejeté : le redémarrage du conteneur
  remet l'attaquant à zéro, et deux répliques ouvrent deux budgets.
- **Réutiliser `secondaryStorage` de Better Auth** — rejeté dans cette phase : il
  déplace aussi les sessions et la vérification, alors que la spec ne demande que
  les compteurs. Le compteur dédié nomme sa clé et son TTL.
- **Un verrou permanent jusqu'à réinitialisation** — rejeté : dix échecs suffisent
  à fermer le compte d'autrui ; le TTL court rend l'attaque non rentable.
- **Échouer fermé quand Redis est absent** — rejeté : le compteur secondaire
  fermerait la Connexion à toute la boutique lors d'une panne du cache.

## Invariants

- Un Compte client, identifié par son adresse normalisée, n'a qu'un compteur, et
  il expire sans intervention.
- Dix échecs consécutifs ouvrent un refus `ACCOUNT_TEMPORARILY_LOCKED` distinct
  de `INVALID_EMAIL_OR_PASSWORD`, avant toute vérification du mot de passe.
- Une Connexion réussie supprime le compteur ; chaque échec compté repose la
  fenêtre de quinze minutes, et un refus ne la prolonge pas.
- Le limiteur par adresse reste actif ; ce compteur ne le remplace pas.
- Aucun mot de passe, aucune empreinte et aucun jeton n'entre dans la clé Redis.
