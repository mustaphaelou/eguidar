# Authentication pathways — what each one enforces

This is the written statement ASVS 6.1.3 and 6.3.4 ask for: every authentication
pathway the shop mounts, the controls each one carries, and the controls it
deliberately does not. A reviewer should be able to tell a decision from an
omission without reading the source.

Vocabulary follows `GLOSSARY.md`: **Inscription**, **Vérification de l'e-mail**,
**Connexion**, **Test de sécurité**, **Session courante**, **Session inactive**,
**Session hors durée absolue**, **Compte client**, **Commande**, **Panier**.

**Phase 2** is the change set this document describes; **Phase 3** is the
follow-up tracked by #813 and is named only where a control is deliberately
absent today. The self-describing password hash section describes #838 (PR
#856), which must merge before this document; until then the code on `main`
still uses Better Auth's default `salt:hex` format.

## The seven pathways

| Pathway                          | Surface                                                                                                              | Mounted by                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Inscription                      | `POST /api/auth/sign-up/email`                                                                                       | `better-auth`                                   |
| Vérification de l'e-mail         | `POST /api/auth/email-otp/send-verification-otp`, `POST /api/auth/email-otp/verify-email`                            | `emailOTP` plugin                               |
| Connexion par mot de passe       | `POST /api/auth/sign-in/email`                                                                                       | `better-auth`                                   |
| Connexion par code               | `POST /api/auth/sign-in/email-otp`                                                                                   | `emailOTP` plugin, no UI                        |
| Connexion sociale                | `GET /api/auth/callback/{google,facebook}`                                                                           | `better-auth`                                   |
| Réinitialisation du mot de passe | `POST /api/auth/email-otp/send-verification-otp` (type `forget-password`), `POST /api/auth/email-otp/reset-password` | `emailOTP` plugin, page `/mot-de-passe-oublie`  |
| Suppression des données Facebook | `POST /api/facebook/suppression-donnees`, page `/suppression-donnees`                                                | `app/api/facebook/suppression-donnees/route.ts` |

Every route is served by `app/api/auth/[...all]/route.ts` except the Meta
callback. That wrapper purges an over-age session before the handler runs, and
replays the Visiteur's Panier after a successful password Connexion or social
callback (ADR-0007, ADR-0024). It does not wrap the Meta route.

## Inscription

**Enforces**

- 15-character minimum, shared by the server config and the client schema
  (`lib/longueur-mot-de-passe.ts`); the library's 128-character maximum remains.
- The password is checked against Have I Been Pwned before the account exists
  (k-anonymity, fail-closed: an upstream failure refuses the Inscription). The
  same check covers both reset routes, not `/change-password` (ADR-0043).
- The Test de sécurité, when `TURNSTILE_SECRET_KEY` is configured, on
  `/sign-up/email`.
- No account enumeration: with `requireEmailVerification`, an existing address
  receives the same synthetic response as a new one.
- No session is created: `requireEmailVerification` disables auto sign-in; the
  Compte client exists but cannot sign in until the Vérification de l'e-mail.
- A unique e-mail (`user.email`) and, since Phase 2, a unique
  `(providerId, accountId)` pair in the database.

**Deliberately absent**

- No password composition rule, no strength meter, no username. Length and the
  breach check are what NIST and ASVS ask for.
- No local top-N blocklist beyond Have I Been Pwned.
- No MFA, passkey or two-factor enrolment.

## Vérification de l'e-mail

**Enforces**

- Six-digit one-time code, stored hashed (SHA-256, base64url) with its attempt
  count; the code is never returned by the API (ADR-0043).
- 5-minute lifetime, three attempts, then the code is destroyed.
- The Test de sécurité on the send endpoint, when configured; 60 s / 3 requests
  per address and path (the `emailOTP` plugin's rule).
- The request is enumeration-safe: an unknown address receives the same success
  response and no e-mail.
- Verifying promotes `emailVerified`; the client then signs in with the password
  chosen at Inscription.

**Deliberately absent**

- No magic-link verification is used; `/verify-email` is mounted by the library
  but no `sendVerificationEmail` sender is configured, so no link is sent — the
  code is the only proof of the address.
- No per-account throttle beyond the three-attempt cap on the code itself.
- No e-mail change in this pathway.

## Connexion par mot de passe

**Enforces**

- Uniform `INVALID_EMAIL_OR_PASSWORD` for unknown address, missing credential,
  missing password and wrong password; the library still runs a dummy hash so
  timing does not reveal existence.
- `EMAIL_NOT_VERIFIED` is distinguishable only after the password checks out.
- Per-address and per-path limiter: 10 s / 3 attempts on `/sign-in/*`; the
  client address is resolved from `cf-connecting-ip`, `x-real-ip`, then the last
  `x-forwarded-for` hop, behind the declared trusted proxies (ADR-0042).
- Per-account counter in Redis, keyed by the normalized typed address: 10
  consecutive failures open a 15-minute `ACCOUNT_TEMPORARILY_LOCKED` refusal,
  before the password check; a successful Connexion clears it; the TTL eases by
  itself. The per-address limiter stays the first line (ADR-0047).
- The 15-character floor applies to new passwords; an existing shorter password
  still authenticates.
- The Test de sécurité, when configured, on `/sign-in/email`.
- A session with 30 minutes of inactivity (**Session inactive**), a 6-minute
  sliding refresh, and an absolute bound of 30 days for a Client and 24 hours
  for the Administration (**Session hors durée absolue**, `SESSION_ABSOLUTE_*`).
  The bound deletes the session row at the first read of the Session courante or
  the first `/api/auth/*` request carrying its cookie (ADR-0024).
- Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `__Secure-` on HTTPS;
  there is no cookie cache, so a revocation is immediate.
- The Visiteur's Panier is replayed onto the Compte client after a successful
  Connexion.

**Deliberately absent**

- No MFA, passkey or security key; the password remains a single factor, which
  is why the floor is 15 (NIST SP 800-63B-4 §3.1.1.2) and not 8.
- No composition rules, no account-lockout escalation beyond the 15-minute
  window, and no extra Test de sécurité after the threshold (the endpoint
  already carries one when configured).
- No password change in the Connexion modal; the reset page is the only
  self-service credential change.
- No OAuth token is involved here; provider tokens are out of scope.

## Connexion par code

This endpoint is mounted by the `emailOTP` plugin and has no surface in the
shop's UI.

**Enforces**

- Six-digit code sent with `type: "sign-in"`; same hashed-at-rest storage,
  5-minute lifetime and three-attempt cap as Vérification de l'e-mail.
- 60 s / 3 requests per address and path (the plugin's rule for
  `/sign-in/email-otp`).
- For an existing Compte client whose e-mail was never verified,
  `revokeUnprovenAccountAccess` deletes every linked account (password and
  Google/Facebook), revokes all its sessions, and promotes `emailVerified`
  before signing in — the library-owned control ADR-0041 relies on.
- A session is created with the same inactivity and absolute bounds as the
  password Connexion.

**Deliberately absent**

- No UI and no link from the Connexion modal. It is a mounted pathway, not a
  product surface.
- The Test de sécurité covers the code _send_ (`/email-otp/send-verification-otp`)
  but not `/sign-in/email-otp` itself: the Test de sécurité plugin's endpoints do not
  include that route.
- No Panier replay: the wrapper's predicate covers `/sign-in/email` and the
  social callback only (Phase 3 keeps the code paths out).
- `disableSignUp` is left at its default (`false`): the endpoint can create a
  Compte client with a verified e-mail for any address whose mailbox is read.
  This is deliberate and bounded by the mailbox, not by the shop.

## Connexion sociale

Providers: Google and Facebook.

**Enforces**

- The provider's authorization code exchange, state check and callback are
  owned by Better Auth; the shop does not implement OAuth itself.
- Facebook's profile e-mail counts as verified (`mapProfileToUser` sets
  `emailVerified: true`), because Facebook requires a confirmed address before
  login; Google already reports one (ADR-0019).
- Linking follows the library's default gates: no `trustedProviders`, no
  `requireLocalEmailVerified: false`. A social identity links to an existing
  Compte client when the provider reports a verified e-mail (both providers do)
  and the local Compte client is verified; otherwise the callback refuses with
  `account not linked`.
- Since Phase 2, `(providerId, accountId)` is unique in the database, so one
  Google or Facebook identity can never map to two Compte clients.
- The visitor's Panier is replayed after a successful callback.
- The resulting session carries the same inactivity and absolute bounds, and the
  auth wrapper purges an over-age session before the callback.

**Deliberately absent**

- No OAuth access/refresh-token encryption at rest yet
  (`account.encryptOAuthTokens` is not enabled; Phase 3).
- No branded OAuth failure page: a cancelled dialog or a provider without an
  e-mail still lands on Better Auth's raw error page (ADR-0019).
- No Test de sécurité: the flow is a top-level redirect, not a posted
  credential.
- No `trustedOrigins` beyond the `baseURL` origin; a second canonical hostname
  would need it (Phase 3).
- No per-account failure counter on the OAuth path; the provider owns that
  credential.

## Réinitialisation du mot de passe

Page `/mot-de-passe-oublie`; the flow is the e-mail code exchange, not a link
(ADR-0002).

**Enforces**

- Request is enumeration-safe: an unknown address gets the same success response
  and no e-mail.
- The Test de sécurité on the send endpoint, when configured; 60 s / 3 requests
  per address and path.
- The code is hashed at rest, expires after 5 minutes and is destroyed after
  three attempts (ADR-0043).
- The new password must be 15 characters and is checked against Have I Been
  Pwned before the credential is written.
- `revokeSessionsOnPasswordReset` is enabled: inside the reset transaction, the
  Compte client's sessions are deleted before the new password is written, so
  the old password's holder is ejected and the Client signs in again (ADR-0002
  amendment, #834).
- The exchange re-creates the `credential` account if it disappeared and
  promotes `emailVerified`.

**Deliberately absent**

- No reset link/token URL; the six-digit code is the only reset secret.
- No security questions, no reset by the Administration from this surface; no
  admin password routes exist: no admin plugin is mounted.
- No Have I Been Pwned coverage for `/change-password` (ADR-0043's declared
  scope).

## Suppression des données Facebook

Public route for Facebook's data-deletion callback (ADR-0046). It is not behind
the Connexion modal and reads no session.

**Enforces**

- `signed_request` must be exactly two non-empty base64url segments; the first
  is `HMAC-SHA256` of the second, keyed with `FACEBOOK_CLIENT_SECRET`, compared
  in constant time after a length guard. The payload must carry a non-empty
  `user_id` and `algorithm: "HMAC-SHA256"`.
- A valid request deletes, in one transaction, the Compte client, its Commandes
  (and their OrderItems by cascade), its sessions, accounts, Articles du panier
  and Brouillons d'Image produit, plus the `verification` rows whose identifier
  contains one of its addresses. The cached Commande pages are invalidated after
  the commit.
- The response carries exactly `{ url, confirmation_code }`; the status page at
  `/suppression-donnees?code=…` is public and confirms the deletion.
- An unknown ASID is a `200` with code and deletes nothing (idempotent replay).
  A wrong or malformed signature is `403`; a missing secret or a failed
  transaction is a generic `500`; every response is `no-store`.

**Deliberately absent**

- No session, cookie, Turnstile or CSRF token: Meta calls server-to-server, and
  the HMAC is the authentication.
- No rate limiter or per-ASID throttle beyond the HMAC.
- No retention or anonymisation of Commandes; the Client asked for deletion.
- The Meta dashboard registration of
  `https://<domain>/api/facebook/suppression-donnees` remains the one manual
  step.

## Mounted by the library, not surfaced by the shop

These endpoints exist under `/api/auth/*` because Better Auth mounts them, but
they are not product surfaces and the shop configures no sender for them:

- `GET /verify-email` — the token-link variant of Vérification de l'e-mail. No
  `emailVerification.sendVerificationEmail` is configured, so no link is sent;
  the code exchange is the only used path.
- `POST /request-password-reset` and `POST /reset-password` — the token-link
  reset. No `sendResetPassword` is configured, so no mail is sent; the page
  `/mot-de-passe-oublie` and the code exchange are the supported reset.
  `/reset-password` appears in the Have I Been Pwned plugin's paths because the
  plugin declares it, not because a surface uses it.
- `POST /change-password` — requires an authenticated session and is rate
  limited (10 s / 3). It is not linked from any surface, and the Have I Been
  Pwned check does not cover it (ADR-0043).

## Cross-cutting state

| Control                              | Value                                                                                   | Owner                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Password floor                       | 15 characters                                                                           | `lib/longueur-mot-de-passe.ts`                          |
| Password ceiling                     | 128 characters (library default)                                                        | `better-auth`                                           |
| Password hash                        | `$scrypt$N=131072,r=8,p=1$<salt base64url>$<key base64url>`, legacy `salt:hex` accepted | `lib/mot-de-passe-hache.ts` (ADR-0045)                  |
| Rehash                               | on successful Connexion when legacy or below target                                     | `lib/rehachage-mot-de-passe.ts`                         |
| Session inactivity                   | 30 minutes, refresh every 6                                                             | `lib/session-constants.ts`                              |
| Session absolute                     | 30 days Client, 24 hours Administration                                                 | `lib/session-constants.ts`, `lib/session-expiration.ts` |
| Per-address auth limiter             | 10 s / 3 for sign-in and sign-up; 60 s / 3 for code sends                               | `better-auth` (memory, per process)                     |
| Per-address failed-Connexion counter | 10 failures / 15 minutes, Redis                                                         | `lib/echecs-connexion.ts` (ADR-0047)                    |
| Provider identity                    | unique `(providerId, accountId)`                                                        | `prisma/schema.prisma`, migration `20261101160000`      |
| Breach check                         | Have I Been Pwned, fail-closed, three declared paths                                    | `lib/auth.ts` (ADR-0043)                                |
| Test de sécurité                     | Turnstile on sign-up, password sign-in and verification/reset sends                     | `lib/auth.ts`                                           |

## Deliberately absent across the shop

- MFA, passkeys/WebAuthn, TOTP, recovery codes. The password is a single factor
  today; that is why the floor is 15.
- Password composition rules and a strength meter (NIST/ASVS ask for length,
  blocklists, and no forced rotation).
- A local breached-password list beyond Have I Been Pwned.
- OAuth token encryption at rest, Test de sécurité `expectedAction`/`allowedHostnames`,
  explicit `trustedOrigins`, and the branded OAuth failure page: all Phase 3.
- Panier replay on the Connexion par code and Vérification de l'e-mail paths.
- A per-account throttle on the code pathways beyond the per-code attempt cap.
- Administrative MFA or a second factor on the Administration.

## Open operational item

The scrypt parameters are the OWASP strongest tier, measured at ~480 ms on the
development host; their confirmation on the Coolify host is the manual
benchmark tracked by #837. If that host measures over one second, the next OWASP
tier (`N=2^16, r=8, p=2`, then `N=2^15, r=8, p=3`) is a one-constant change, and
the rehash-on-Connexion migrates existing Comptes clients without a reset.
