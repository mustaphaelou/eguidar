# Les flux d'authentification possèdent leur état ; la modale compose sans en garder

La spec #973 partait d'un constat : les modales de Connexion et d'Inscription gardaient leur état à trois
endroits à la fois. Le panneau de la modale stockait l'étape et l'adresse saisie ; chaque crochet de flux
stockait le mot de passe, l'attente, le refus et l'échange de code ; et les transitions remontaient par un
canal brut `onStepChange(step, value)`. Rien ne possédait la machine. Changer le traitement d'un refus
`EMAIL_NOT_VERIFIED` exigeait de toucher un crochet en sachant qu'un panneau au-dessus détenait l'étape ;
ajouter une étape signifiait modifier un type exporté par la modale ; et prouver le tout exigeait de
reconstruire le panneau dans les tests — `useControlledFlow` était une seconde implémentation du stockage
du panneau, et les deux suites de flux bâtissaient chacune un faux formulaire avec quatre saisies et deux
boutons fabriqués à la main. La suite de la modale interceptait les deux crochets par `vi.mock` uniquement
pour capturer `onStepChange`, afin que deux tests règlent l'étape depuis l'extérieur — une capacité qu'aucun
appelant de production ne possède.

## Decision

- **Les trois flux lisent de la même façon.** `useSignInFlow` et `useSignUpFlow` possèdent l'étape,
  l'adresse, le mot de passe (et le nom, pour l'Inscription), l'attente, le refus, l'avis (Connexion
  seulement) et l'échange de code composé. `useForgotPasswordFlow` est intact : il a déjà cette forme et
  est le modèle auquel les deux autres convergent. L'interface est état plus accesseurs plus intentions :
  les accesseurs de saisie restent, parce que les saisies contrôlées en ont besoin ; `onStepChange` est
  retiré — la seule façon de changer d'étape est une transition nommée (soumettre, vérifier le code,
  revenir au formulaire) ; l'étape n'est plus réglable par un appelant.

- **Le transport de l'authentification est un port injecté.** `PortAuthentification` couvre les cinq
  opérations que les flux réclament — Connexion par mot de passe, Inscription, Connexion sociale, envoi du
  code de Vérification de l'e-mail et vérification de ce code. Son adaptateur par défaut compose ces
  opérations sur le client réel, dans un module feuille (`port-authentification-client.ts`). C'est la
  seconde application de la forme qu'ADR-0018 a choisie pour les mutations du Panier : un test passe une
  doublure en mémoire (`test/port-authentification.ts`, à côté de celle du Panier), aucun appel de
  production n'en passe. Le refus traverse le port dans sa forme actuelle (`code`, `message`) : la
  traduction en copie reste au flux, qui la porte déjà. **La Réinitialisation est l'exception nommée** :
  `useForgotPasswordFlow` appelle l'échange de code sans port et garde l'adaptateur réel — il a déjà la
  forme cible et n'est pas migré.

- **La Destination post-connexion est une entrée, pas une lecture.** Le flux de Connexion reçoit la
  Destination, l'adresse de la page et l'adresse de retour d'une Connexion sociale échouée en paramètres,
  et cesse d'importer le contrôleur de la modale. ADR-0015 tient : le contrôleur reste le seul lecteur et
  le seul écrivain du Lien de connexion et se contente de remettre les valeurs. La fin garde ses deux
  chemins — la navigation vers la Destination, ou le signal de fin au panneau qui ferme la modale.

- **Le panneau de la modale est une composition sans état.** Il lit les valeurs du contrôleur une fois,
  choisit la modale, porte les titres, les descriptions de l'étape du code et le lien de bascule, et ne
  stocke plus rien. Un seul flux est monté à la fois : la modale d'Inscription ne monte pas le flux de
  Connexion, et réciproquement. `AuthFlow` et son type d'étape exporté meurent ; le type d'étape appartient
  désormais au flux qui le possède, et le panneau n'en garde que les valeurs dont il a besoin pour ses
  titres.

## Ce qui ne change pas

- **ADR-0015 tient.** Le contrôleur de la modale reste le seul lecteur et le seul écrivain du Lien de
  connexion (`?open`/`?next`/`?error`). Cette décision déplace qui possède l'état du flux, pas qui touche
  la couture de l'URL : elle ne rouvre pas la question, pour que la prochaine revue d'architecture ne la
  re-suggère pas.

- **Aucun terme du glossaire n'est ajouté, aucun renommage.** Les crochets gardent leur nom ; la machine à
  étapes est un concept d'implémentation, et le glossaire nomme déjà tout ce que le Client peut observer.

- **La garde des Envois protégés continue d'observer l'adaptateur réel.** C'est elle la seule qui tient
  les listes client et serveur des Envois protégés en accord, et c'est le fichier le plus facile à
  « réparer » en le vidant de sa substance. Un port injecté là la ferait passer sans rien prouver : ses
  call-sites passent les nouvelles signatures sans port, et sa méthode d'observation — le client réel sur
  un `fetch` simulé — ne change jamais.

## Considered Options

- **Migrer à moitié** (un flux possède son état, l'autre reste détenu par le panneau) — rejeté : une
  modale à moitié migrée aurait deux propriétaires de l'étape, qui est pire que chacun des deux états
  finaux. Le changement atterrit entier ; c'est la raison d'être de ce ticket dans la spec.

- **Garder `onStepChange`** — rejeté : un canal d'écriture brut permet à tout appelant de mettre la
  modale dans un état que ses propres transitions interdisent. L'étape doit être hors de portée de
  l'extérieur.

- **Simuler le chemin du module dans les tests** — rejeté : la branche des refus reste impraticable par
  consommateur et le port reste implicite. ADR-0018 a choisi le transport injecté pour les mutations du
  Panier ; c'est la seconde application de cette forme.

- **Un type d'étape partagé** — rejeté : le type appartient au flux qui possède l'étape. Un type partagé
  recentraliserait exactement ce que cette décision distribue.

## Invariants

- **Un propriétaire par étape.** L'étape d'un flux vit dans un seul crochet, et aucun autre module ne la
  détient. Tenue par `components/auth/use-sign-in-flow.test.tsx` et
  `components/auth/use-sign-up-flow.test.tsx`, qui affirment `courant().step` directement, et par
  `components/auth/use-forgot-password-flow.test.tsx` — le modèle, déjà de cette forme.

- **L'étape est hors de portée de l'extérieur.** Les crochets n'exposent aucun accesseur d'écriture
  d'étape, et `AuthFlow`/`AuthFlowStep` n'existent plus : il n'y a plus de canal à attribuer. Tenue par le
  type, et par la suite de la modale (`components/auth/auth-dialog.test.tsx`), qui ne pilote l'étape que
  par le formulaire — « derives title, description, and swap from the flow step » pour la Connexion,
  l'aller-retour du code pour l'Inscription.

- **Un seul flux monté à la fois.** La composition de `components/auth/auth-dialog.tsx` ne monte qu'une
  pièce par modale, chacune dans son `DialogContent`. Tenue par
  `components/auth/auth-dialog.test.tsx` — « ne monte qu'un seul flux à la fois » : la modale ouverte
  à la Connexion ne rend ni le champ `name` ni le bouton de l'Inscription, et réciproquement.

- **Le panneau est une composition sans état.** Il ne stocke plus ni étape ni adresse ; il porte les
  titres, les descriptions et la bascule. Tenue par `components/auth/auth-dialog.tsx` (aucun état de
  flux) et par la suite de la modale, qui prouve le comportement de bout en bout à travers le fournisseur.

- **La garde observe l'adaptateur réel.** `components/auth/envois-proteges.test.tsx` — « les deux listes
  disent la même chose » et « attache à chaque widget l'action de son Envoi protégé » — exerce le client
  réel sur un `fetch` simulé, sans port injecté. Un port injecté la ferait passer sans rien prouver.

- **Le Lien de connexion est inchangé.** ADR-0015 tient : lecture et écriture uniques du seam,
  assainissement, nettoyage à la fermeture. Tenue par `components/auth/auth-dialogs.test.tsx`.

## Amendement — le contrôleur porte l'avis d'un flux précédent

Le corps attribue « l'avis (Connexion seulement) » au flux de Connexion : c'est le sien, celui de sa
propre Vérification de l'e-mail (« Votre e-mail est vérifié. Connectez-vous. »), et `useSignInFlow`
le garde dans `notice`.

Un second avis, de même nature mais d'un autre propriétaire, naît du passage de l'Inscription à la
Connexion : la Vérification de l'e-mail de l'Inscription constate un fait que le flux d'Inscription
emporte en se démontant. Le contrôleur le porte une fois (`AuthDialogsContextValue.avis`,
`components/auth/auth-dialogs.tsx`), `openLogin({ avis })` le reçoit, et le panneau de Connexion le
rend dans son en-tête. Le panneau reste une composition sans état : il lit l'avis du contrôleur, ne
le stocke pas, et le masque dès que son propre flux parle — une attente, un refus ou son propre
`notice`.

Ce que l'amendement ne change pas : chaque flux garde son étape et son avis propre ; le panneau
n'ajoute aucun état ; ADR-0015 reste le seul lecteur et le seul écrivain du Lien de connexion. Les
deux avis ne se confondent pas : celui du flux raconte son échange, celui du contrôleur transmet le
fait d'un flux qui n'est plus monté.
