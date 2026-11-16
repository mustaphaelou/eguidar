# Le Refus d'authentification a un propriétaire unique, et le Client ne lit jamais la phrase de la bibliothèque

Les codes de refus étaient des chaînes littérales dispersées dans trois modules —
`components/auth/auth-form-glue.ts`, `lib/echecs-connexion-regles.ts`, `lib/test-de-securite.ts` — et
la phrase française était un `switch` dans un composant client. Ce que cette forme permettait est
arrivé : trois codes sont apparus ailleurs, le `switch` les a laissés tomber dans sa branche par
défaut, et cette branche rendait `error.message`. Le Client lisait donc une phrase anglaise dans une
boutique française — `PASSWORD_COMPROMISED` affichait « The password you entered has been
compromised », la réponse « trop de requêtes » du limiteur ne portait aucun code et affichait « Too
many requests », et le refus fermé du Test de sécurité nommait `UNKNOWN_ERROR` et affichait
« Something went wrong ». Aucun test ne pouvait le voir : aucun n'affirmait que chaque code a une
phrase. Loi 3 de `docs/ARCHITECTURE.md` : une valeur partagée habite un module neutre.

Le défaut est corrigé (#1042) ; cet ADR est la décision qui le fonde.

## Décision

- **`lib/refus-authentification.ts` est le propriétaire unique du vocabulaire du refus** :
  `CODES_REFUS_AUTHENTIFICATION`, l'union fermée des codes, `MESSAGES_REFUS_AUTHENTIFICATION` et
  `messageRefusAuthentification`, la phrase française de chacun, la phrase générique d'un code
  inconnu, et `estRefusQuiDepenseLeJeton`. Le module est neutre : il ne lit ni la requête ni la
  session, et les deux côtés de la couture client-serveur peuvent l'importer.

- **La table des phrases est exhaustive par construction.** Elle est déclarée contre l'union des
  codes, donc un code sans phrase ne compile pas. L'oubli devient une erreur de type, pas une branche
  par défaut qu'un test ne traverse jamais.

- **Le composant client ne nomme aucun code.** `translateAuthError` reçoit un code et rend la phrase
  du module ; le seul endroit où un code est comparé est le module qui les possède.

- **Le Client ne lit jamais la phrase de la bibliothèque.** Un code sans phrase rend la phrase
  française générique, et le code est journalisé côté serveur. Un repli qui montre `error.message`
  est une fuite de langue, et une fuite de langue est un défaut dans une boutique qui n'a qu'une
  langue.

- **Le port tourne la réponse sans code du limiteur en `TOO_MANY_ATTEMPTS`.** La bibliothèque rend un
  `429` qui ne porte qu'un `message` ; l'adaptateur est la couture où un détail de transport devient
  un refus nommé, donc c'est là que le code se fabrique, et nulle part ailleurs.

- **Le Test de sécurité se remet à zéro sur l'ensemble fermé des refus qui ont consommé le jeton** :
  `MISSING_RESPONSE`, `VERIFICATION_FAILED`, `UNKNOWN_ERROR`. Il ne se remet pas à zéro sur
  `INVALID_OTP`, `OTP_EXPIRED` ni `INVALID_EMAIL_OR_PASSWORD` : ces refus n'ont pas touché le jeton,
  et un défi de plus sur l'étape la plus souvent rejouée punit le Client. L'ensemble est possédé par
  le même module que les codes, donc un refus lié au jeton ne peut pas y être oublié.

- **Le vocabulaire ne porte que les codes qu'une voie peut rendre.** `USER_NOT_FOUND` et
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` n'ont aucun producteur atteignable : la Réinitialisation
  passe par le code, et l'Inscription répond une réussite synthétique sous `requireEmailVerification`.
  `EMAIL_NOT_VERIFIED` reste : la Connexion le reçoit, le flux l'intercepte pour passer à l'échange du
  code, et il ne l'affiche pas.

## Options envisagées

- **Garder le `switch` et ajouter les trois cas manquants** — rejeté : c'est la forme qui a produit le
  défaut. Le cas suivant l'oubliera aussi, et rien ne le signalera.

- **Rendre `error.message` quand il existe, et la phrase française sinon** — rejeté : c'est
  précisément la fuite d'anglais que le défaut a livrée.

- **Traduire côté serveur** — rejeté : la phrase est une copie de surface. Le serveur rend un code
  stable, et la surface choisit la langue. Le jour où le magasin en aura deux, un seul module change.

- **Remettre le Test de sécurité à zéro à chaque refus** — rejeté : le code mal saisi est le refus le
  plus fréquent, et redonner un défi à chaque frappe punit le Client pour une faute ordinaire.

## Invariants

- Un code sans phrase ne compile pas.
- Aucune phrase de bibliothèque n'atteint le Client.
- Un refus qui a consommé le jeton en redemande un ; les autres n'en redemandent pas.
- Un code présent dans le vocabulaire a un producteur atteignable, ou il n'y est pas.

## Ce que cet ADR coûte

- **L'union doit grandir avec chaque code.** Un code rendu par une nouvelle voie qui n'entre pas dans
  l'union affiche la phrase générique : le Client perd la précision, et rien n'échoue à la
  compilation. C'est le prix de l'exhaustivité par le type, et il se paie à chaque montée de version
  de la bibliothèque.
- **La phrase est une copie de la boutique.** Une reformulation ne touche qu'un module, mais une
  traduction future demande de la relire pièce par pièce, sans que le code dise laquelle dépend d'une
  autre voie.
