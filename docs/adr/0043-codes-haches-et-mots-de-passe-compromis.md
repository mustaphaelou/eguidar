# Les codes sont hachés au repos, les mots de passe compromis sont refusés

Un code de Vérification de l'e-mail encore en attente est un secret vivant : six chiffres
suffisent à prendre la main sur un Compte client dont l'Inscription n'est pas terminée. Or Better
Auth écrit ce code en clair par défaut (`storeOTP: "plain"`) : une lecture de la table
`verification` livrait un code utilisable pendant cinq minutes. La même Inscription acceptait
n'importe quel mot de passe, y compris un mot de passe déjà publié dans une fuite connue.

#820 ferme les deux sans changer le schéma : le code est haché au repos, et l'Inscription comme la
réinitialisation du mot de passe refusent un mot de passe compromis. La décision s'écrit à côté
d'ADR-0002 (la réinitialisation du mot de passe passe par l'échange du code) et d'ADR-0019 (les
fournisseurs sociaux). Elle ne les contredit pas : elle ne touche ni la Connexion sociale, ni le
Facebook `emailVerified`, et elle n'ajoute aucun terme au glossaire — le vocabulaire reste celui de
la Vérification de l'e-mail, et « code » désigne le secret échangé, jamais un « OTP ».

## Décision

- **`storeOTP: "hashed"` sur le plugin `emailOTP`.** La valeur écrite est l'empreinte SHA-256 du
  code, encodée en base64url sans remplissage, suivie de `:` et du nombre de tentatives
  (`<empreinte>:0`). La comparaison reste à temps constant. La stratégie de renvoi reste
  `"rotate"` — c'est le défaut : `"reuse"` supposerait de relire le code en clair, ce qu'une
  empreinte interdit, et aucune surface de la boutique ne s'appuyait dessus.

- **Le code ne se relit plus par l'API.** `getVerificationOTP` refuse de rendre le code d'un
  stockage haché ; le test d'intégration s'appuie sur ce refus plutôt que de relire la valeur en
  base pour la rejouer.

- **`haveIBeenPwned()` est enregistré dans la liste des plugins.** Il couvre l'Inscription
  (`/sign-up/email`) et les routes de réinitialisation du mot de passe (`/reset-password`,
  `/email-otp/reset-password`), avec le comportement par défaut de la bibliothèque.

- **Le mode d'échec reste fermé.** Sans option, une panne du service de fuites fait échouer
  l'envoi : l'Inscription rend une erreur 500 et aucune ligne `user` n'est créée. Un service
  indisponible n'est pas une autorisation ; l'erreur est visible plutôt que contournée.

- **Le refus est distinct d'un mauvais mot de passe.** Un mot de passe compromis rend
  `PASSWORD_COMPROMISED` (400) à l'Inscription comme à la réinitialisation du mot de passe ; un
  mot de passe faux à la Connexion rend `INVALID_EMAIL_OR_PASSWORD` (401). Le Client sait qu'il
  doit choisir un autre mot de passe, pas le ressaisir.

- **Rien ne change au schéma.** La colonne `verification.value` est déjà une chaîne et le suffixe
  `:tentatives` existait avant ce changement ; aucune migration n'est nécessaire.

## Options envisagées

- **Laisser `storeOTP: "plain"`** — rejeté : une fuite de la table `verification` livre des codes
  vivants, utilisables pour une Vérification en cours.

- **`storeOTP: "encrypted"`** — rejeté : la clé de déchiffrement vit sur le même hôte que la base,
  donc le chiffrement ne protège pas d'une lecture de la table. L'empreinte et la comparaison à
  temps constant suffisent pour un code qui expire en cinq minutes avec trois tentatives.

- **Échouer ouvert avec un journal quand le service de fuites est indisponible** — rejeté :
  accepter silencieusement un mot de passe compromis est précisément ce que le contrôle doit
  empêcher. La dépendance à un tiers est assumée et rendue visible par une erreur.

- **Une liste locale de mots de passe compromis** — rejeté : elle vieillit et pèse lourd. Le
  protocole de k-anonymat de Have I Been Pwned n'envoie que les cinq premiers caractères du SHA-1
  du mot de passe ; le mot de passe lui-même ne quitte jamais le serveur.

## Invariants

- Une lecture de `verification` ne rend jamais un code utilisable pour une Vérification en attente.
- Le format stocké est `<SHA-256 base64url du code>:<tentatives>`, et la vérification compare à
  temps constant.
- Un mot de passe connu comme compromis est refusé à l'Inscription et à la réinitialisation du mot
  de passe ; après le refus de réinitialisation, l'ancien mot de passe reste en vigueur.
- Une panne du service de fuites refuse l'Inscription : l'échec est fermé, jamais une acceptation.
- Aucune modification de schéma, aucune migration, aucune surface rendue modifiée. La Connexion par
  mot de passe, la Connexion sociale et la Vérification de l'e-mail gardent leurs contrôles.
