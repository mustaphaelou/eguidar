# Facebook e-mail counts as verified; social providers are Facebook and Google

The storefront adds Facebook as a social provider alongside Google. Facebook's Graph API
exposes no e-mail-verification claim, so Better Auth records a Facebook profile as
`emailVerified: false`. With the repo's defaults (`trustedProviders: []`,
`requireLocalEmailVerified: true`) an existing Compte client whose e-mail matches — a Google
Client, or an e-mail/mot de passe Client — is refused at the callback with `account not
linked`, and a Facebook-first account stays locally unverified, so a later Google sign-in with
the same e-mail is refused too. Apple is removed: its Coolify keys were build-time only, the
button never rendered in production, and the storefront never really offered it.

## Decision

- **A Facebook e-mail is treated as verified** (`mapProfileToUser` sets `emailVerified: true`).
  Facebook requires a confirmed e-mail before it allows login, and this is exactly how Google
  already behaves. Linking is then symmetric: a Client signs into one Compte client whichever
  provider they use, as long as the e-mail matches.
- **The social providers are Facebook and Google** — Facebook first in the Connexion modal;
  Apple's code, env keys and copy go.
- **Social buttons live on Connexion only.** Inscription keeps its contract (ADR-0001:
  sign-up does not auto-login); a first-time social visitor is created by the same
  "Continuer avec …" click in Connexion.
- **Failed callbacks keep today's behavior** — a cancelled dialog or a provider without an
  e-mail lands on Better Auth's raw error page; branded handling is a separate follow-up on
  the modal controller seam (ADR-0015), not part of this change.

## Considered Options

- **`accountLinking.trustedProviders: ["facebook"]` only** — rejected: it repairs linking
  _into_ verified accounts but leaves Facebook-created accounts unverified, so a later Google
  sign-in with the same e-mail stays blocked; half a fix.
- **Keep Better Auth defaults** — rejected: the most common case (an existing Client tries
  Facebook with the same e-mail) is refused on a raw error page.
- **`requireLocalEmailVerified: false`** — rejected: weakens linking for every provider and
  for accounts whose e-mail was never verified.

## Invariants

- One Compte client per e-mail: no provider creates a duplicate account for an e-mail that
  already exists with a verified local address.
- `emailVerified` means "the e-mail is attested" — by the OTP exchange, or by Facebook or
  Google; it no longer implies the code exchange for social accounts.
- The Prisma schema and the Panier replay seam need no change: `account.providerId` is
  provider-agnostic and the auth API route already replays the Visiteur Panier on any
  `/callback/*`.

## Amendement — La Connexion sociale échouée revient dans la modale (#853)

La quatrième puce de la Décision — « Failed callbacks keep today's behavior » — est remplacée.
Une Connexion sociale qui échoue ne rend plus la page d'erreur brute de la bibliothèque : le
Client revient sur la page courante, la modale de Connexion s'ouvre, et un message traduit
explique l'échec. Un dialogue annulé (`access_denied`) et un profil Facebook sans adresse
(`email_not_found`) ont chacun leur message ; le second propose les entrées « Continuer avec … »
déjà présentes, parce que ce Client n'a rien fait de faux et a besoin d'un pas suivant.

La couture est celle du contrôleur de modales (ADR-0015) : le code d'échec voyage par le Lien de
connexion, le contrôleur le lit et le traduit, et aucune seconde route d'erreur n'est ouverte. Un
code que la modale ne connaît pas tombe sur un message générique plutôt que sur une page brute.
Le reste de la décision tient : un e-mail Facebook vaut vérification, les fournisseurs sont
Facebook et Google, les boutons sociaux restent sur la Connexion seule, et l'Inscription ne
connecte pas automatiquement.

Ce que l'amendement ne change pas : les deux invariants de liaison ci-dessus, l'unique Compte
client par e-mail, le sens de `emailVerified`, et le fait que le schéma Prisma et la couture de
rejeu du Panier n'ont pas besoin de changer.
