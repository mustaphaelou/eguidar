# Password reset flow via OTP on dedicated page

We decided to implement the password reset flow on a dedicated standalone page at `/mot-de-passe-oublie` (with a permanent redirect from `/request-password-reset`), using Better Auth's `emailOTP` plugin with a 2-step single-page experience (request OTP with Turnstile captcha -> verify OTP & set new password).

Why: Unlike login/signup, password reset is an infrequent, high-security recovery action that often involves email switching or external links. Keeping it on a clean standalone page avoids modal nesting complications. Using the existing Better Auth `emailOTP` plugin (`sendVerificationOtp` with `type: "forget-password"` and `resetPassword`) reuses the existing Resend email template and unified OTP verification mechanism without adding extra token schemas. Upon successful reset, the user is redirected to `/connexion` to log in with their updated credentials.

Considered options: link-based token reset with `/reinitialiser-mot-de-passe?token=...` (rejected — requires extra token routing and diverges from our OTP email infrastructure); in-modal reset flow (rejected — clutters the login dialog and risks state loss on accidental dismissal).

## Amendement — La réinitialisation mène à la modale, elle ne redirige pas (#473)

Deux affirmations du texte ne disent plus ce que le code fait. Le corps
reste le record de ce qui était cru à l'écriture ; c'est le présent
amendement qui fait foi.

**« Upon successful reset, the user is redirected to `/connexion` to log in
with their updated credentials » — il n'y a aucune redirection.** Après
`resetPassword`, `use-forgot-password-flow.ts:49` fait `setStep("success")`
et rend la main : ni `router.push`, ni `redirect()`, ni `window.location`.
Le formulaire rend une étape de succès (`forgot-password-form.tsx:191-204`)
qui **propose** un lien `<Link href={loginUrl()}>` — le Client choisit
quand il va se connecter. Et `loginUrl()` n'est pas `/connexion` : c'est
`/?open=login`, la page d'accueil avec la modale de Connexion ouverte
(ADR-0001). `/connexion` n'est plus une page, c'est une redirection servie
par `proxy.ts:6-9`, qui renvoie elle aussi vers `loginUrl()`. Le mot
« redirected » est donc le seul faux de la phrase ; le reste se produit —
le mot de passe est changé, la Connexion est à portée de lien.

**Le vocabulaire est celui que le glossaire interdit.** « OTP » et
« Turnstile captcha » appartiennent à la pile d'une autre bibliothèque :
l'échange d'un code contre une adresse est la **Vérification de l'e-mail**,
le défi exigé avant l'envoi est le **Test de sécurité** (implémenté avec
Turnstile — le glossaire n'interdit que le nom du concept, pas celui de
l'outillage). `emailOTP`, `sendVerificationOtp` et `verifyEmail` restent
les noms de la bibliothèque, et le corps garde ses mots d'époque. Cette
dérive a un prix, et la spec #469 l'a payé : « OTP » et « Turnstile
captcha » sont deux noms qui ne désignent rien dans le glossaire, donc
aucun regard ne pouvait les confronter au code — et un code d'erreur venu
d'une autre pile de défi, `INVALID_RESPONSE`, s'est logé dans
`test-de-securite.tsx` jusqu'à #470, un module qui ne pouvait pas le
reconnaître.

Le reste de la décision tient : la page `/mot-de-passe-oublie`, la
redirection permanente depuis `/request-password-reset`
(`next.config.ts:23-31`), le plugin `emailOTP` en deux étapes sur une seule
page, et le refus de la mise en modale.

## Amendement — La réinitialisation révoque les sessions en cours (#834)

L'option `revokeSessionsOnPasswordReset` était laissée à son défaut, `false` : la
réinitialisation changeait bien le mot de passe, mais toute session déjà ouverte
continuait de s'authentifier. Celui qui détenait l'ancien mot de passe n'était donc
pas éjecté par le geste censé le révoquer — ASVS 7.4.3 demande au minimum l'option
de terminer les autres sessions après un changement d'identifiant.

**La décision est de l'activer.** Après l'échange du code, une fois le nouveau mot
de passe écrit, `/email-otp/reset-password` supprime toutes les sessions du Compte
client (`internalAdapter.deleteUserSessions`, `better-auth@1.6.26`,
`node_modules/better-auth/dist/plugins/email-otp/routes.mjs:599`) : la session ouverte avec l'ancien mot de passe,
comme les autres, ne relit plus de Client. Le Client se reconnecte avec le nouveau
mot de passe.

Le reste de la réinitialisation ne change pas : demande sans énumération, code à
usage unique haché au repos (ADR-0043), vérification du code avant de toucher au
mot de passe, et page `/mot-de-passe-oublie` de l'amendement précédent. L'ancien
mot de passe reste en vigueur si la réinitialisation échoue.
