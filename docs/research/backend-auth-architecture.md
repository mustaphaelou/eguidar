# Backend authentication architecture for the Connexion modal: verdict and prioritised gaps

> **Research-only document.** Every claim below is traced to a primary source: the installed
> `better-auth@1.6.26` source in `node_modules/`, the official Better Auth documentation, the
> IETF RFCs that own the OAuth behaviour, Google's and Meta's own identity documentation, OWASP
> ASVS 5.0 / the OWASP Password Storage Cheat Sheet, NIST SP 800-63B-4, and Cloudflare's
> Turnstile documentation. All web sources were retrieved on 28 October 2026. No application
> code, schema or configuration in this checkout was modified; no package was installed and no
> server was started. Anything I could not confirm from a primary source is listed in
> [Unverified](#unverified).

## Summary

- **The architecture family is right; do not rewrite it.** eguidar authenticates through a
  confidential OAuth client that runs on the Next.js server, exchanges the code server-side, and
  keeps its own cookie session — the pattern the OAuth working group calls
  [Backend For Frontend](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps#section-6.1).
  Better Auth is doing that correctly today: `state` + a signed state cookie for CSRF, PKCE `S256`
  for Google, exact redirect URIs, `httpOnly`/`Secure`/`SameSite=Lax` session cookies, and a
  database-backed session with no cookie cache, so revocation is immediate
  (`node_modules/better-auth/dist/oauth2/state.mjs:9-30`,
  `node_modules/@better-auth/core/dist/oauth2/create-authorization-url.mjs`,
  `node_modules/better-auth/dist/cookies/index.mjs:20-49`).
- **One change breaks password login in production right now.** The
  `emailVerification.beforeEmailVerification` hook (`lib/auth.ts:40-46`) calls
  `revoquerAccesNonProuve(..., { emailVerified: true })`, which deletes **every** `credential`
  account of a not-yet-verified user. Better Auth calls that hook immediately before promoting an
  e-mail through `/email-otp/verify-email` — the exact route the Inscription modal uses. A normal
  e-mail + password registration therefore loses its password at the moment the code is verified,
  and the "Votre e-mail est vérifié. Connectez-vous." message leads to `INVALID_EMAIL_OR_PASSWORD`.
  Better Auth 1.6.26 already implements this revocation **natively, on the right route**
  (`/sign-in/email-otp`), which makes the custom seam both redundant and harmful
  (`node_modules/better-auth/dist/db/revoke-unproven-account-access.mjs`,
  `node_modules/better-auth/dist/plugins/email-otp/routes.mjs:424-433`).
- **The rate limiter is very likely degraded to a single global bucket in production.** Better
  Auth reads only `x-forwarded-for` by default, and returns "no IP" whenever that header carries
  more than one hop (behind Cloudflare → Coolify it does). With no IP it keys every request on
  `no-trusted-ip|path`, so the built-in `3 requests / 10 s` sign-in rule becomes **three sign-ins
  per ten seconds for the whole site**, and per-IP brute-force protection disappears
  (`node_modules/@better-auth/core/dist/utils/ip.mjs:194-217`,
  `node_modules/better-auth/dist/api/rate-limiter/index.mjs`). The repo already solves this
  correctly for search (`lib/limiteur-recherche.ts:32-40` prefers `cf-connecting-ip`); auth never
  got the same treatment.
- **`minPasswordLength: 8` is the floor, not the target.** ASVS 5.0 requires 8 and *strongly
  recommends 15* ([V6.2.1](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md));
  NIST SP 800-63B-4 requires **15** for a password used as a single factor, 8 only when it is part
  of MFA ([§3.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html)). There is no breached-password
  check, which both ASVS 6.2.4 (L1) and NIST require, even though Better Auth ships a first-party
  `haveIBeenPwned` plugin in this very version
  (`node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs`).
- **Password hashing is the right algorithm at well under OWASP's cost.** Better Auth uses scrypt
  with `N=16384, r=16, p=1, dkLen=64` and a 16-byte salt
  (`node_modules/@better-auth/utils/dist/password.node.mjs`), i.e. 32 MiB and one pass — roughly
  40 % of OWASP's *weakest* listed configuration (`N=2^14, r=8, p=5`) and a quarter of its strongest
  ([Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).
  The stored format `salt:hex` carries **no algorithm or parameter marker**, so raising the cost
  later has no incremental migration path — OWASP recommends storing the algorithm and work factor
  with the hash for exactly this reason.
- **ADR-0019's factual premise is confirmed, and its mitigation should be kept.** The Graph API has
  no e-mail-verification claim: the `User` node exposes `email` ("will not be returned if no valid
  email address is available") and a deprecated `verified` flag that means "registered for mobile /
  confirmed via SMS / entered a card", not "owns this e-mail"
  ([Graph API User](https://developers.facebook.com/docs/graph-api/reference/user/)). Better Auth
  therefore hard-codes `emailVerified: profile.email_verified ?? false`
  (`node_modules/@better-auth/core/dist/social-providers/facebook.mjs:147`). Verdict on
  `mapProfileToUser: () => ({ emailVerified: true })`: **keep**, with the caveat in §3.6.
- **OTP + password is not redundant.** Better Auth draws two distinct pathways, and ASVS requires
  that multiple pathways be documented and enforced consistently (6.1.3, 6.3.4). The OTP path is
  genuinely well defended — 6 digits (≈20 bits, blessed by ASVS 6.5.4), 5-minute lifetime (ASVS
  6.5.5 caps out-of-band codes at 10 minutes), **3 wrong attempts destroy the code**, plus a
  `60 s / 3` per-IP limit. Its one real weakness is that the code is stored **in clear**.
- **Two OWASP L2 session gaps** — no absolute session lifetime (every refresh slides the 30-minute
  window, so an active session never ends; ASVS 7.3.2) and `revokeSessionsOnPasswordReset` left at
  its `false` default, so sessions survive a reset (ASVS 7.4.3).
- **Redis is not needed yet.** Better Auth's `secondaryStorage` would move sessions, verification
  records and rate-limit counters to Redis in one option, and the repo already has a client
  (`lib/redis.ts`). The correct next step is narrower: rate-limit storage, so counters survive a
  container restart and a second replica. Do **not** enable `session.cookieCache`; it would
  trade away the immediate revocation the current design gets for free.

---

## 0. Method and scope

Two source families were used, in this order.

1. **The installed library, for every option name, default and code path.** The version is
   `1.6.26` (`node_modules/better-auth/package.json`). Citations of the form
   `node_modules/better-auth/dist/…` point at the exact file (and line range) read in this
   checkout. The official docs were then read to confirm that the documented contract matches the
   code, because the published docs describe the current release and the checkout is pinned.
2. **The spec or platform that owns the behaviour**, for every security claim: RFC 9700 (OAuth 2.0
   Security BCP), RFC 7636 conceptually via RFC 9700 §2.1.1, OIDC Core, Google's web-server OAuth
   and OIDC guides, the Graph API reference, Meta's permissions and data-deletion pages, OWASP ASVS
   5.0 V6/V7, the OWASP Password Storage Cheat Sheet, NIST SP 800-63B-4, and Cloudflare's Siteverify
   page.

`node_modules/next/dist/docs/` was checked and is irrelevant to this question: it documents Next.js
routing/caching, not authentication. The only Next.js-specific mechanism in play is `nextCookies()`
(`node_modules/better-auth/dist/integrations/next-js.mjs`), which flushes `Set-Cookie` from Server
Actions, and it is already mounted last in the plugin array as required.

The Google and Facebook pages were served in Chinese (Meta's and Google's locale negotiation); the
quotations below are translated from those pages, and the URLs cited are the canonical English
ones.

---

## 1. What this stack actually does — verified inventory

Everything in this table was read out of the installed source, not from memory.

| Concern | Effective value | Source |
|---|---|---|
| Base URL | `BETTER_AUTH_URL`, passed explicitly (recommended) | [`baseURL` docs](https://www.better-auth.com/docs/reference/options) |
| Auth route base path | `/api/auth` (default) ⇒ OAuth callbacks at `/api/auth/callback/{google,facebook}` | `basePath` default, same page |
| Session lifetime | `expiresIn = 1800 s`, sliding | `lib/session-constants.ts`; default is 7 days (`node_modules/better-auth/dist/context/create-context.mjs:146-148`) |
| Session refresh | `updateAge = 360 s` | `lib/session-constants.ts`; default 1 day ([session-management](https://www.better-auth.com/docs/concepts/session-management)) |
| Session storage | `session` table in Postgres; **no** `secondaryStorage`, **no** `cookieCache` | `lib/auth.ts`, `prisma/schema.prisma` |
| Session cookie | `__Secure-better-auth.session_token` when `BETTER_AUTH_URL` is `https://…`; `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `path: "/"` | `node_modules/better-auth/dist/cookies/index.mjs:20-49` |
| Password hash | scrypt `N=16384, r=16, p=1, dkLen=64`, 16-byte salt, stored `salt:hex` | `node_modules/@better-auth/utils/dist/password.node.mjs` |
| Password length | min **8** (repo sets it explicitly; it is also the default), max **128** | `lib/auth.ts`; `…/create-context.mjs:185-186` |
| E-mail verification gate | `requireEmailVerification: true` ⇒ sign-in throws `403 EMAIL_NOT_VERIFIED` after a correct password | `node_modules/better-auth/dist/api/routes/sign-in.mjs:312-325` |
| Sign-up on duplicate e-mail | returns a **synthetic 200 user**, not an error, *because* `requireEmailVerification` is true | `node_modules/better-auth/dist/api/routes/sign-up.mjs:163-208`; [enumeration-protection docs](https://www.better-auth.com/docs/authentication/email-password) |
| Global rate limit | enabled in production only; `window: 10 s`, `max: 100`, storage `memory` | `…/create-context.mjs:169-175` |
| Sign-in / sign-up / change-password / change-email limit | `10 s / 3` per **IP+path** | `node_modules/better-auth/dist/api/rate-limiter/index.mjs:370-386` |
| Password-reset & OTP-send limit | `60 s / 3` | same function |
| OTP plugin limits | `60 s / 3` on 9 endpoints, incl. `verify-email`, `check-verification-otp`, `sign-in/email-otp` | `node_modules/better-auth/dist/plugins/email-otp/index.mjs:78-140` |
| OTP lifetime / length / attempts | `300 s` / 6 digits / **3** wrong attempts invalidate the code | `…/email-otp/index.mjs:10-16`; `…/email-otp/routes.mjs:245-253`; [email-otp docs](https://www.better-auth.com/docs/plugins/email-otp) |
| OTP at rest | **plaintext** (`storeOTP: "plain"` default) | `…/email-otp/index.mjs:16`; `types.d.mts` |
| Turnstile | server-side Siteverify, fail-closed, 10 s timeout, `x-captcha-response` header | `node_modules/better-auth/dist/plugins/captcha/index.mjs`; `…/verify-handlers/cloudflare-turnstile.mjs`; `…/constants.mjs` |
| Account linking | defaults: `enabled: true`, `requireLocalEmailVerified: true`, `trustedProviders: []`, `disableImplicitLinking: false` | `node_modules/better-auth/dist/oauth2/link-account.mjs:21-23` |
| Facebook `emailVerified` | forced `true` by the repo's `mapProfileToUser` | `lib/auth.ts:52-56` |
| OAuth state | 32-char random `state` + DB `verification` row + signed `state` cookie, 10-minute payload expiry | `node_modules/better-auth/dist/oauth2/state.mjs:9-30` |
| PKCE | Google: `S256`; **Facebook: not sent** | `…/social-providers/google.mjs:45-67`; `…/social-providers/facebook.mjs:42-56` |
| `role` field | server-owned (`input: false`) — provider profiles cannot set it | [`additionalFields` docs](https://www.better-auth.com/docs/concepts/database) |

Two details worth naming because they are easy to get wrong and are currently right:

- **Sign-in does not leak account existence.** Unknown e-mail, missing credential row, missing
  password and wrong password all return the same `401 INVALID_EMAIL_OR_PASSWORD`, and the
  unknown-user path runs a **dummy hash** first to burn comparable time
  (`…/api/routes/sign-in.mjs:287-311`).
- **Sign-up does not leak it either** — but only because `requireEmailVerification` is `true`. The
  enumeration guard is `shouldReturnGenericDuplicateResponse = requireEmailVerification ||
  autoSignIn === false`, so flipping either would silently re-introduce a `422
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` oracle (`…/sign-up.mjs:163`).

---

## 2. Verdict — e-mail + password

**The shape is production-correct; five parameters are not.** Nothing here needs re-architecting.
`emailAndPassword` + `requireEmailVerification` + OTP verification + a database session is the
right composition for this application, and the two enumeration paths are already handled.

### 2.1 Hashing

scrypt is a defensible choice and the library's own reasoning is sound — the docs say "OWASP
recommends using scrypt if argon2id is not available. We decided to use scrypt because it's
natively supported by Node.js" ([email-password](https://www.better-auth.com/docs/authentication/email-password)).
The arithmetic is the problem:

| | Memory (`128·N·r`) | Passes `p` | Work (memory × passes) |
|---|---|---|---|
| Installed Better Auth | `128·16384·16` = **32 MiB** | 1 | ≈ 32 MiB-passes |
| OWASP weakest listed scrypt tier | `128·2^14·8` = 16 MiB | 5 | ≈ 80 MiB-passes |
| OWASP strongest listed scrypt tier | `128·2^17·8` = 128 MiB | 1 | ≈ 128 MiB-passes |

So the installed default sits at roughly **40 % of the weakest configuration OWASP lists**, and
`r=16` takes it outside OWASP's table entirely (which fixes `r=8`). This is a tuning defect, not a
design defect, and it is the one finding here whose fix has a migration cost — see §7, S1.

Two secondary observations, stated with their real severity:

- The hash format `salt:hex` stores **no algorithm or cost marker**. OWASP explicitly recommends
  the opposite ("Using a mix of hashing algorithms is easier if the password hashing algorithm and
  work factor are stored with the password using a standard format, for example, the modular PHC
  string format"). Until that is fixed, raising the cost means either a silent flag-day rehash or
  an application-side version registry.
- `verifyPassword` compares hex strings with `===`, not in constant time
  (`…/@better-auth/utils/dist/password.node.mjs`). This is **not** exploitable in the current flow:
  the attacker supplies the password, never the stored hash, and the comparison happens after a
  32 MiB KDF. Do not spend a ticket on it.

**bcrypt truncation does not apply.** Better Auth does not use bcrypt; scrypt has no 72-byte
limit, and the 128-character cap is a DoS guard on the KDF, comfortably above ASVS 6.2.9's
"at least 64 characters are permitted" (L2).

### 2.2 Length and blocklists

- `minPasswordLength: 8` **duplicates the default** (`create-context.mjs:185`) and is therefore
  noise in the config, but it also states the wrong target: ASVS 6.2.1 requires 8 and *strongly
  recommends 15*; NIST SP 800-63B-4 §3.1.1.2 says "Verifiers and CSPs SHALL require passwords that
  are used as a single-factor authentication mechanism to be a minimum of 15 characters in length"
  and permits 8 only when the password is *part of* MFA. eguidar's password is a single factor, so
  15 is the applicable floor if NIST is taken as the benchmark.
- There is **no blocklist**. ASVS 6.2.4 (L1) requires checking the top ~3000 passwords and 6.2.12
  (L2) a breached set; NIST requires a blocklist outright. `haveIBeenPwned()` ships in this version
  and is not installed: it k-anonymises (SHA-1 prefix, 5 chars, sent to `api.pwnedpasswords.com`),
  hooks `/sign-up/email`, `/change-password`, `/reset-password`, `/email-otp/reset-password` by
  default, and — important for ops — **fails closed with a 500** if the upstream API is
  unreachable (`node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs`).

### 2.3 Verification gate and the revocation bug

`requireEmailVerification: true` is correct: it makes sign-up enumeration-safe, and sign-in returns
a distinguishable `EMAIL_NOT_VERIFIED` only *after* the password checks out
(`…/sign-in.mjs:312`), so it leaks nothing.

The hook that rides on verification is the problem, and it is worth laying out the exact sequence
because it is short and deterministic:

1. `POST /sign-up/email` → user created with `emailVerified: false`, then
   `linkAccount({ providerId: "credential", password: hash })`, then `{ token: null }` because
   auto sign-in is skipped (`…/sign-up.mjs:218-250`). The password **exists** at this point.
2. Inscription modal sends the OTP and calls `POST /email-otp/verify-email`
   (`components/auth/verification-de-l-email.ts:35-60`).
3. `verifyEmailOTP` calls `beforeEmailVerification(user.user, …)` **before** the promotion
   (`…/email-otp/routes.mjs:326`).
4. The repo's hook calls `revoquerAccesNonProuve(acces, id, { emailVerified: true })`, which is
   `emailVerified === true`, the row is still `false`, so it deletes **all** `credential` accounts
   and **all** sessions (`lib/revocation-acces-non-prouve.ts:26-48`).
5. `updateUser({ emailVerified: true })` then runs.
6. The modal says "Votre e-mail est vérifié. Connectez-vous." and calls `signIn.email` again, which
   finds no credential row and returns `401 INVALID_EMAIL_OR_PASSWORD`
   (`…/sign-in.mjs:293-298`).

The guard test in `lib/verification-email-frontiere.test.ts` asserts that the hook runs *before*
the promotion, and it reads the library source to do it — so the repository's own test **locks the
bug in**. The test suite cannot catch it because no test drives `auth.api.signUpEmail` end to end;
the suites exercise the pure function and the seam's presence, not the flow.

The irony is that the protective intent was already implemented upstream, correctly scoped. Better
Auth 1.6.26 has `revokeUnprovenAccountAccess`, documented as: "When a sign-in OTP confirms a
pre-existing account whose email was never verified, any existing password on that account is
removed and its sessions are revoked. The user is signed in through the OTP and can set a new
password through password reset" ([email-otp docs](https://www.better-auth.com/docs/plugins/email-otp)).
It fires on `/sign-in/email-otp` only — the path where the e-mail proof genuinely arrives *from
outside* the sign-up session, which is exactly the attack the repo's seam was written for
(`node_modules/better-auth/dist/db/revoke-unproven-account-access.mjs`;
`…/email-otp/routes.mjs:424-433`). On `/email-otp/verify-email` the proof arrives from the same
person who just chose the password, so there is nothing unproven to revoke.

Note also the asymmetry that proves the seam is not load-bearing: `resetPasswordEmailOTP` promotes
`emailVerified` **without** calling `beforeEmailVerification`
(`…/email-otp/routes.mjs:598`). If the invariant were real, that route would be a hole; it is not,
because the password is overwritten in the same transaction.

### 2.4 Password reset

The reset path is sound: `/email-otp/reset-password` verifies the OTP with `atomicVerifyOTP`
before touching the password, re-creates the `credential` account if it is missing, and refuses
short/long passwords with the same bounds as sign-up (`…/email-otp/routes.mjs:580-600`). Request is
enumeration-safe: for an unknown address `sendVerificationOTP` deletes the code and returns
`{ success: true }` without sending anything (`…/email-otp/routes.mjs:102-108`).

The gap is session termination: `revokeSessionsOnPasswordReset` defaults to **`false`**
(`node_modules/@better-auth/core/dist/types/init-options.d.mts:664-667`), the repo does not set it,
and the OTP reset route honours it — so after a reset, an attacker's live session survives. ASVS
7.4.3 asks for at least the option to terminate other sessions after a credential change.

### 2.5 Rate limiting

The defaults are sane in isolation and already target the right endpoints: `10 s / 3` for
`/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*`; `60 s / 3` for
`/request-password-reset`, `/send-verification-email`, `/forget-password*`,
`/email-otp/send-verification-otp`, `/email-otp/request-password-reset`
(`…/api/rate-limiter/index.mjs:370-386`), with plugin rules overriding the global ones.

Three defects matter, in order:

1. **Key resolution (P0, deployment).** Better Auth trusts only `x-forwarded-for`
   (`DEFAULT_IP_HEADERS`, `…/@better-auth/core/dist/utils/ip.mjs:194`); without `trustedProxies` it
   returns `null` when the header has more than one value (`ip.mjs:172-192`); and with no IP the
   limiter keys on `no-trusted-ip|path`, logging once: "Rate limiting could not determine a client
   IP and is falling back to a single shared per-path bucket"
   (`…/api/rate-limiter/index.mjs`, `resolveRateLimitConfig`). Behind Cloudflare → Coolify the
   header is multi-hop, so the expected outcome is a **site-wide** 3-sign-ins-per-10-seconds
   ceiling and no per-client isolation at all. The repo's own `lib/limiteur-recherche.ts:32-40`
   already encodes the correct preference order (`cf-connecting-ip`, then `x-real-ip`, then the
   *last* `x-forwarded-for` hop) and documents why the first hop is forgeable.
2. **Granularity.** The key is `ip|path`, never the account. An attacker with a pool of addresses
   faces no per-account ceiling; NIST §3.2.2 requires that the verifier "limit consecutive failed
   authentication attempts using a specific authenticator on a single subscriber account to no more
   than 100 by disabling that authenticator"; ASVS 6.1.1 requires the documentation to explain how
   lockout is *prevented* while brute force is stopped.
3. **Storage.** `storage: "memory"` with no `secondaryStorage`
   (`create-context.mjs:174`) means counters are per container process: a restart resets them, and
   two replicas each get their own budget.

Conversely, the *shape* of the limit is fine: it is fail-closed, it is applied in the request
phase before the handler, and it returns `429` with `X-Retry-After`.

### 2.6 Cookies and session flags

Correct, and automatically so — provided `BETTER_AUTH_URL` is the public `https://` origin in
production, because the `__Secure-` prefix and the `Secure` attribute are derived from it
(`…/cookies/index.mjs:21,32-36`). `SameSite=Lax` is the right value here and is *required* for the
OAuth callback, which is a top-level GET navigation from the provider; `Strict` would drop the
session cookie on that hop. `httpOnly: true` is default. `__Host-` is **not** reachable through
`advanced.cookiePrefix` (the `__Secure-` prefix would be prepended to it), so do not chase it;
`__Secure-` on the exact origin is the achievable guarantee.

The one thing to check operationally is `trustedOrigins`: it defaults to the `baseURL` origin, so
if the site is reachable at both apex and `www`, every auth POST from the non-canonical host fails
the origin check (`…/api/middlewares/origin-check.mjs`, `validateOrigin`). No `trustedOrigins` is
set in `lib/auth.ts`.

---

## 3. Verdict — Google and Facebook

**Both providers are wired correctly for a confidential web client.** The flow is authorization
code with a server-side exchange, not implicit — the pattern RFC 9700 §2.1.2 tells clients to use
("clients SHOULD NOT use the implicit grant"), and the one Google documents for web server apps
([OAuth 2.0 for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)).

### 3.1 Who is responsible for what

This distinction was the point of the exercise, so it is worth stating precisely.

| Mitigation | Owner | State in this repo | Owning source |
|---|---|---|---|
| `state` bound to the user agent | client | present: 32-char random, DB row + signed cookie, 10-min expiry | RFC 9700 §2.1; `…/oauth2/state.mjs:9-30` |
| PKCE `S256` | client | Google **yes**, Facebook **no** | RFC 9700 §2.1.1; `…/google.mjs:45-71`; `…/facebook.mjs:42-57` |
| Exact redirect-URI matching | **IdP** | Google enforces exact string match; Meta requires the URI be pre-registered | RFC 9700 §2.1; [Google redirect-URI rules](https://developers.google.com/identity/protocols/oauth2/web-server) |
| Client authentication at the token endpoint | client | present: `client_secret` posted server-side | RFC 9700 §2.5 |
| No open redirectors | client | present: `callbackURL`/`redirectTo` validated against `trustedOrigins` | RFC 9700 §2.1; `origin-check.mjs` |
| Authorization response over TLS | IdP | `https://` only in production | RFC 9700 §2.6 |
| Clickjacking protection on the consent screen | **IdP** | n/a; the app itself sends `frame-ancestors 'none'` | RFC 9700 §4.16; `next.config.ts:23` |

RFC 9700 §2.1.1 is explicit that PKCE is **RECOMMENDED, not MUST, for confidential clients**
("Public clients MUST use PKCE … For confidential clients, the use of PKCE is RECOMMENDED … this
advice applies to all kinds of OAuth clients, including web applications"). So Facebook's missing
PKCE is a documented, acceptable residual risk for this client type, not a defect to escalate —
the state cookie plus the client secret already covers the code-injection threat PKCE would add
defence in depth against. `skipStateCookieCheck` is left at its safe default (`false`).

### 3.2 Redirect URIs to register

`basePath` is `/api/auth`, so the two callbacks are:

- `https://<public-origin>/api/auth/callback/google`
- `https://<public-origin>/api/auth/callback/facebook`

plus the `http://localhost:3000/…` pair for development. Google's rules are strict and worth
knowing before a deploy breaks: HTTPS is required (localhost excepted), the host may not be a bare
IP, no wildcards, no fragments, no path traversal, no userinfo, and the match is byte-exact
including scheme, case and trailing slash
([redirect-URI validation rules](https://developers.google.com/identity/protocols/oauth2/web-server)).
Better Auth's own docs warn that a wrong `baseURL` is the usual cause of `redirect_uri_mismatch`
([google](https://www.better-auth.com/docs/authentication/google)).

### 3.3 Scopes

- Google: `email profile openid`, hard-coded unless `disableDefaultScope`
  (`…/google.mjs:51-55`), plus `include_granted_scopes=true`. Minimal and correct for login; no
  refresh-token scopes are requested (`access_type` is not sent, so Google defaults to `online`),
  which is right for an app that never calls a Google API.
- Facebook: `email public_profile` (`…/facebook.mjs:47`), the documented default
  ([facebook](https://www.better-auth.com/docs/authentication/facebook)). `public_profile` is
  granted automatically to all apps, so `email` is the only meaningful consent — and Meta documents
  that users may grant only *some* of the requested permissions, and that the app "must handle"
  refusal ([Facebook Login permissions](https://developers.facebook.com/docs/facebook-login/guides/permissions)).

### 3.4 When Facebook returns no e-mail

Meta's own reference settles it: `email` is "The User's primary email address listed on their
profile. **This field will not be returned if no valid email address is available.**"
([Graph API User](https://developers.facebook.com/docs/graph-api/reference/user/)), and users can
decline the permission. So an absent e-mail is an expected outcome, not an error.

In this version it is an **unhandled** outcome. `handleOAuthUserInfo` dereferences
`userInfo.email.toLowerCase()` with no guard (`…/oauth2/link-account.mjs:11`), so a profile without
an e-mail throws a `TypeError` before any `redirectOnError` can run. ADR-0019 already accepts a raw
error page for this case, so the *product* decision is consistent; what the Client actually receives
is a thrown exception rather than the branded failure, and I did not observe the rendered response
(see [Unverified](#unverified)). That belongs on the follow-up list, not the security list.

### 3.5 Account linking — exact option semantics, from source

All five names in the brief exist and mean what the docs say; the evaluated predicate is
`…/oauth2/link-account.mjs:21-23`:

```js
const isTrustedProvider = opts.isTrustedProvider
  || (opts.trustProviderByName !== false && c.context.trustedProviders.includes(account.providerId));
const requireLocalEmailVerified = accountLinking?.requireLocalEmailVerified ?? true;
if ((!isTrustedProvider && !userInfo.emailVerified)
  || (requireLocalEmailVerified && !dbUser.user.emailVerified)
  || accountLinking?.enabled === false
  || accountLinking?.disableImplicitLinking === true) {
  return { error: "account not linked", data: null };
}
```

Read that as two independent gates. **Gate A** (provider-side): the provider must assert the
e-mail, *or* be trusted. **Gate B** (local-side): the existing row must already be verified.

- `accountLinking.enabled` (default `true`) and `disableImplicitLinking` (default `false`) are
  master switches; either one at the wrong value rejects the link.
- `trustedProviders` (default `[]`) bypasses **Gate A only** — which is precisely why ADR-0019's
  "considered option" was half a fix.
- `allowDifferentEmails` (default `false`) is checked on the explicit `linkSocial` path, not here
  (`…/api/routes/callback.mjs`, the `link` branch).
- `requireLocalEmailVerified` (default `true`) holds **Gate B**. Setting it to `false` to "make
  Facebook work" is the trap ADR-0019 correctly refused.

### 3.6 The `mapProfileToUser` verdict: **keep**

The question was keep / change / replace. Keep, for three reasons, and record the residuals.

1. **The premise is true.** Verified independently against Meta's reference: no e-mail-verification
   claim exists on the `User` node, and the adjacent `verified` field is deprecated and means
   something else entirely (registered for mobile / confirmed via SMS / entered a card). Better
   Auth's `emailVerified: profile.email_verified ?? false`
   (`…/facebook.mjs:147`) is therefore always `false`, by construction.
2. **The alternative is worse.** With Gate A unmet, no Facebook sign-in can ever link into an
   existing account, and a Facebook-first account stays locally unverified so a later Google
   sign-in with the same address is refused. That breaks the "one Compte client per e-mail"
   invariant for the most common real flow — exactly as ADR-0019 argues.
3. **The blast radius is bounded.** The mapper sets only `emailVerified`; it cannot set `email`,
   `id` or `role` (`role` is `input: false`). It cannot create a link to an unverified local row,
   because Gate B still requires `dbUser.user.emailVerified` — and an unverified row cannot log in
   at all (`requireEmailVerification: true`). The flag is therefore only ever consumed for rows
   that have already been proven by another route.

Residual risk to state in the ADR rather than paper over: the security of the whole Facebook path
rests on Meta only exposing an address the account holder controls. That is documented for the
*field*, not for the *verification*, so it is recorded in [Unverified](#unverified). The mitigation
that would actually reduce it — requiring `email_verified`, or refusing Facebook login altogether —
costs the linking behaviour the ADR exists to preserve. Keep, and note the dependency.

---

## 4. The "one Compte client per e-mail" invariant

**How it is preserved today.** The `user.email` column is `@unique`
(`prisma/schema.prisma:15`), so no code path can create a second row for an address. Social logins
that find an existing row either link (both gates pass) or fail with `account not linked`; they
never fork the account. Better Auth identifies a provider identity by the pair
`(providerId, accountId)`, which is namespace-correct per ASVS 6.8.1 ("register and identify the
user using a combination of the IdP ID … and the user's ID in the IdP")
([database concepts](https://www.better-auth.com/docs/concepts/database)).

**Where takeover could hide.** Four places, in descending order of realism:

1. **`requireLocalEmailVerified: false`.** Would let a Facebook login (whose e-mail is attacker-
   controlled if the attacker owns *a* Facebook account with the victim's address — possible only
   if the victim's address is on the attacker's Facebook profile, which is the same trust boundary
   as above) link into a local row that was never proven. The repo keeps the default; keep it.
2. **A future `trustedProviders: ["facebook"]`.** Same gate, weaker: it would bypass Gate A without
   Gate B changing. Harmless today, a landmine if combined with a change to Gate B.
3. **The verification-time revocation, if it were kept and "fixed" naively.** Any attempt to keep
   the hook while excluding legitimate sign-ups will need to distinguish "the person who set this
   password" from "someone else". There is no such signal on the row: `sign-up` creates no session
   (`{ token: null }`), so there is no session to compare against. That is the structural reason
   the upstream implementation puts the check on the OTP *sign-in* route instead — there, the
   proof and the session are created together.
4. **OTP plaintext at rest.** A read-only leak of the `verification` table within a 5-minute window
   yields a valid code for any pending address, which converts a "sessions might leak" breach into
   "any in-flight account can be taken over". This is the cheapest takeover vector on the board and
   the cheapest to close (`storeOTP: "hashed"`).

---

## 5. Session and token architecture

**Stateful is the right call here, and it is already stateful.** The session is a row in Postgres
keyed by an opaque token, and the cookie carries only that token. That gives immediate, server-side
revocation — which the repo actually uses (`revoquerAccesNonProuve` deletes sessions; sign-out
deletes the row). A stateless JWT session would have made the "Session inactive" feature and the
verification-time revocation impossible without a revocation list, which is a session table with
extra steps.

**Do not enable `session.cookieCache`.** It would remove one Postgres read per render, but the docs
are explicit about the price: "When cookieCache is enabled, revoked sessions may remain active on
other devices until the cookie cache expires (maxAge)" ([session-management](https://www.better-auth.com/docs/concepts/session-management)).
Combined with ADR-0024's "one read per request" discipline, the current cost is one indexed lookup
per authenticated render — a good trade.

**The 30-minute / 6-minute pair.** `updateAge = expiresIn / 5` means a request after 6 idle minutes
pushes `expiresAt` to `now + 30 min`; an active user never expires, an idle one is gone within 30
minutes. That is a sane *inactivity* timeout — stricter than NIST's AAL2 guidance of "no more than
1 hour" — but there is **no absolute lifetime**, so ASVS 7.3.2 ("an absolute maximum session
lifetime") is unmet, and a stolen cookie is usable indefinitely by a patient attacker. The cheapest
compliant fix is a `session.createdAt` check in `lireSession()` plus a documented cap
(see §7, S2); NIST's AAL1/2 ceilings of 30 days / 24 hours give the bounds.

**Redis.** The dependency exists and is used for the search limiter (`lib/redis.ts`,
`lib/limiteur-recherche-redis.ts`), so the operational muscle is there. Better Auth's
`secondaryStorage` would move **sessions, verification records and rate-limit counters** in one
option, and the rate limiter switches to `storage: "secondary-storage"` automatically when it is
present (`create-context.mjs:174`). Two cautions from the source: the atomic `consume` path requires
the storage to implement `increment`, otherwise the limiter silently falls back to a best-effort
read-then-write with a startup warning (`…/api/rate-limiter/index.mjs`, `legacyConsume`); and if
sessions move to Redis, `storeSessionInDatabase: true` should be set if the admin back-office is to
keep working during a Redis flush. **My recommendation is not to move sessions** — Postgres is the
system of record for `orders`/`cartItems` and a Redis eviction must not log everyone out. Move only
the **rate-limit counters**, which is a restart-survival and multi-replica fix, not a performance
one.

---

## 6. Verdict — the OTP path

**Running both is correct, not redundant.** They answer different questions: the password is the
credential, the OTP is the *proof of the address*, and `requireEmailVerification` makes the second
a precondition of the first. The same plugin then serves password reset (`type: "forget-password"`)
and the sign-in escalation from `EMAIL_NOT_VERIFIED`, which is why ADR-0002 could reuse it instead
of adding a token table.

The defences are better than they look, and better than most hand-rolled implementations:

- **Per-code attempt cap.** A wrong code increments `attempts` in the `verification` value; at 3 the
  record is **deleted** and the call returns `TOO_MANY_ATTEMPTS` (`…/email-otp/routes.mjs:245-253`;
  `allowedAttempts` default 3 in `types.d.mts`). This is a per-address counter, which is exactly the
  per-account throttle the *password* path lacks.
- **Short lifetime.** 300 s, against ASVS 6.5.5's 10-minute ceiling for out-of-band codes.
- **Enough entropy for the threat.** 6 digits ≈ 19.9 bits, and ASVS 6.5.4 explicitly blesses "6
  random digits" as sufficient for out-of-band codes — because the attempt cap, not the entropy, is
  what bounds guessing.
- **Rate limits.** `60 s / 3` per IP on send, verify, and sign-in
  (`…/email-otp/index.mjs:78-140`), plus the repo's Turnstile on
  `/email-otp/send-verification-otp` (`lib/auth.ts:64-76`).
- **Fail-closed Turnstile.** Missing token ⇒ `400`, upstream error/timeout (10 s) ⇒ `500`, never
  "allow" (`…/plugins/captcha/index.mjs`; `…/constants.mjs`).

Two exposures remain:

1. **Codes are stored in clear** (`storeOTP: "plain"`). `verifyStoredOTP` already supports
   `"hashed"` with a constant-time compare, so the fix is one option
   (`…/email-otp/otp-token.mjs`). This is ASVS 6.5.2's concern (sub-112-bit secrets hashed at rest)
   applied to the right secret.
2. **`/sign-in/email-otp` is a third, undocumented pathway.** The endpoint is mounted, `disableSignUp`
   defaults to `false`, so it will create an account with `emailVerified: true` for any address the
   caller can read mail at, and it is not in the modal's UI. It is not a vulnerability — it needs
   mailbox access — but ASVS 6.1.3/6.3.4 require every pathway to be documented and consistently
   controlled, and the cart-replay seam does not cover it (`app/api/auth/[...all]/route.ts:8-11`
   matches only `/sign-in/email` and `/callback/`). Either surface it deliberately or set
   `disableSignUp: true` and document that accounts come from Inscription only.

---

## 7. Prioritised gap list

Each row names the file to touch and the source that justifies it. "Must" means *the current
deployment is wrong*; "should" means *a control is weaker than the benchmark*; "nice" means
*cheap hardening*.

### Must fix (security / broken)

| # | Change | File | Why |
|---|---|---|---|
| **M1** | **Delete the `beforeEmailVerification` hook and `lib/revocation-acces-non-prouve.ts`** (with its test and the guard in `lib/verification-email-frontiere.test.ts`). Rely on Better Auth's built-in revocation, which fires on `/sign-in/email-otp` before the promotion. If an in-repo invariant is wanted, assert that *that* route keeps calling it. | `lib/auth.ts:40-46`, `lib/revocation-acces-non-prouve.ts`, `lib/revocation-acces-non-prouve.test.ts`, `lib/verification-email-frontiere.test.ts` | Better Auth creates the credential row at sign-up (`…/sign-up.mjs:218-236`) and calls the hook before promotion (`…/email-otp/routes.mjs:326`); the upstream equivalent is `…/db/revoke-unproven-account-access.mjs`, invoked at `…/email-otp/routes.mjs:424-433`, and documented in the [email-otp docs](https://www.better-auth.com/docs/plugins/email-otp) |
| **M2** | **Make the rate limiter see the real client IP**: `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]` and, if the chain is multi-hop, `trustedProxies` covering Cloudflare + the Coolify proxy. Same preference order as `adresseClient()`. | `lib/auth.ts` (new `advanced` block); reuse the ordering from `lib/limiteur-recherche.ts:32-40` | `…/@better-auth/core/dist/utils/ip.mjs:172-217` (single-value rule, `x-forwarded-for` default); `…/api/rate-limiter/index.mjs` (`no-trusted-ip` shared bucket + warning); [`advanced.ipAddress`](https://www.better-auth.com/docs/reference/options) |
| **M3** | **Hash OTPs at rest**: `emailOTP({ storeOTP: "hashed", … })`. Expect `resendStrategy: "reuse"` to stop being usable (it cannot recover a hash) — irrelevant, `"rotate"` is the default. | `lib/auth.ts:59-63` | `…/email-otp/index.mjs:16` (default `"plain"`); `…/email-otp/otp-token.mjs`; ASVS [6.5.2](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md) |
| **M4** | **Add a breached-password check**: `haveIBeenPwned()` in `plugins`, and decide the failure mode (default is fail-closed with a 500 — acceptable, but document it, or wrap the plugin and fail open on network error with a log). | `lib/auth.ts` (`plugins` array) | `node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs`; ASVS 6.2.4 (L1) and 6.2.12 (L2); NIST SP 800-63B-4 §3.1.1.2 blocklist requirement |

### Should improve (security hardening / standards conformance)

| # | Change | File | Why |
|---|---|---|---|
| **S1** | **Raise scrypt cost and make the hash self-describing.** Either a custom `password.hash`/`verify` writing a PHC-style string (`$scrypt$N=…,r=…,p=…$salt$hash`) with rehash-on-login, or accept `N=2^15…2^17, r=8, p=1…3` once benchmarked on the Coolify VPS. Highest-value "should" on the list. | `lib/auth.ts` (`emailAndPassword.password`) | `…/@better-auth/utils/dist/password.node.mjs` vs the [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) scrypt table |
| **S2** | **Add an absolute session lifetime** alongside the inactivity window, and document both with the deviation rationale ASVS asks for. A `createdAt` age check in `lireSession()` (e.g. 30 days, or 24 h for `role: "admin"`) is enough. | `lib/use-cases/session-courante.ts`, `lib/session-constants.ts`, a new ADR | ASVS [7.1.1 and 7.3.2](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x16-V7-Session-Management.md); NIST AAL1 ≤ 30 days / AAL2 ≤ 24 h |
| **S3** | **`revokeSessionsOnPasswordReset: true`**, so a reset ejects whoever had the old password. | `lib/auth.ts` (`emailAndPassword`) | default `false` at `…/core/dist/types/init-options.d.mts:664-667`; honoured at `…/email-otp/routes.mjs:599`; ASVS 7.4.3 |
| **S4** | **Add a per-account failed-login throttle** (count failures per e-mail in Redis with a short TTL, and require the security test/OTP step after N). Keep the IP limiter as the first line. | `lib/auth.ts` hooks or a route wrapper; `lib/redis.ts` | NIST SP 800-63B-4 §3.2.2 ("limit consecutive failed authentication attempts … on a single subscriber account"); ASVS 6.1.1, 6.3.1; the IP+path key is `…/api/rate-limiter/index.mjs` `createRateLimitKey` |
| **S5** | **`@@unique([providerId, accountId])` on `account`** (and consider `@@unique([identifier])` on `verification`, which the OTP identifier scheme already assumes — `toOTPIdentifier` is one record per type+address). | `prisma/schema.prisma` + a migration | `findOAuthUser` does a single-row `findOne` on that pair (`…/db/internal-adapter.mjs:431-447`); [`account` identity is the pair](https://www.better-auth.com/docs/concepts/database); `…/email-otp/utils.mjs` |
| **S6** | **Add Meta's data-deletion callback** (`POST /api/auth/facebook/data-deletion` or a dedicated route): verify the `signed_request` HMAC with the app secret, delete the ASID's data, reply `{ url, confirmation_code }`, and register the HTTPS URL in the app dashboard. | new `app/api/…/route.ts` | [Data Deletion Request Callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback) — "Your callback must use secure HTTPS … and must be listed in the App Dashboard" |
| **S7** | **Raise `minPasswordLength` to 12 (or 15) and say why in the ADR.** 8 is the library default and the ASVS floor; 15 is the NIST requirement for single-factor passwords and the ASVS strong recommendation. | `lib/auth.ts`, `lib/auth-form-schemas.ts` (client mirror), ADR | ASVS 6.2.1; NIST SP 800-63B-4 §3.1.1.2 |
| **S8** | **Move the rate-limit counters to Redis** via `secondaryStorage` with `increment`, *without* moving sessions (leave `storeSessionInDatabase`/sessions alone or set it explicitly). Survives restarts, correct across replicas. | `lib/auth.ts` + `lib/redis.ts` | `…/create-context.mjs:169-175`; [`secondary storage`](https://www.better-auth.com/docs/concepts/database); `legacyConsume` fallback in `…/api/rate-limiter/index.mjs` |
| **S9** | **Document the two (three) auth pathways** in one place — Connexion password, Connexion sociale, Vérification de l'e-mail, and the mounted `/sign-in/email-otp` — with the controls each one enforces. | `docs/adr/` (new) or `GLOSSARY.md` neighbourhood | ASVS 6.1.3 and 6.3.4 ("no undocumented pathways") |

### Nice to have (cheap hardening / ops hygiene)

| # | Change | File | Why |
|---|---|---|---|
| **N1** | Set `account.encryptOAuthTokens: true` so provider access/refresh tokens are AES-256-GCM at rest. | `lib/auth.ts` | [`account.encryptOAuthTokens`](https://www.better-auth.com/docs/reference/options) |
| **N2** | Pass Turnstile `expectedAction` (and `allowedHostnames` if the widget is pinned to one host). | `lib/auth.ts:64-76`, `components/auth/test-de-securite.tsx` | `…/plugins/captcha/verify-handlers/cloudflare-turnstile.mjs`; [Siteverify best practices](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) ("Validate the action and hostname when specified") |
| **N3** | Extend the cart-replay predicate to `/sign-in/email-otp` and `/email-otp/verify-email`, so an OTP login also reattaches the Visiteur Panier. | `app/api/auth/[...all]/route.ts:8-11` | ADR-0024 (the replay exception), ADR-0007 |
| **N4** | Set `trustedOrigins` explicitly (apex + `www`, plus the Coolify preview host if any), instead of relying on the `baseURL` default. | `lib/auth.ts` | `origin-check.mjs` `validateOrigin`; [`trustedOrigins`](https://www.better-auth.com/docs/reference/options) |
| **N5** | Brand the OAuth failure path instead of Better Auth's raw error page (already scheduled in ADR-0019 as a follow-up on the ADR-0015 seam). | `app/api/auth/[...all]/route.ts`, `components/auth/` | ADR-0019 "Failed callbacks keep today's behavior"; `…/oauth2/link-account.mjs:11` for the no-email `TypeError` |

### Already correct — do not "fix" these

- **Sign-up enumeration protection** is active *because* `requireEmailVerification: true`
  (`…/sign-up.mjs:163-208`). Any change to that flag or to `autoSignIn` re-opens the oracle.
- **Uniform sign-in errors + dummy hash** (`…/sign-in.mjs:287-311`).
- **Session cookies** already carry `httpOnly`, `Secure`, `__Secure-`, `SameSite=Lax`, `path=/`
  (`…/cookies/index.mjs:20-49`).
- **Turnstile is server-side, fail-closed, and bounded at 10 s** — no client-only validation
  anywhere (`…/plugins/captcha/index.mjs`, `…/constants.mjs`).
- **`role` cannot be set by a provider profile or by API input** (`input: false`).
- **No cookie cache** ⇒ revocation is immediate. Keep it that way.
- **OTP attempt cap (3) + 5-minute TTL + per-IP `60/3`** is a solid brute-force story; only the
  at-rest encoding is weak.
- **`emailOTP` and `emailAndPassword` together is the right design**, not duplication.
- **`mapProfileToUser: () => ({ emailVerified: true })`** — keep, per §3.6.

---

## 8. Proposed decisions, in the repository's ADR voice

Two of the findings are decisions, not chores, and should be recorded rather than only patched.
Both are written in the register of `docs/adr/0019-facebook-email-trusted-social-providers.md`.

### ADR-0041 — La révocation de l'accès non prouvé appartient à la bibliothèque

Un Compte client dont l'e-mail n'est pas vérifié ne prouve pas que le mot de passe posé dessus
appartient au propriétaire de la boîte. La couture `emailVerification.beforeEmailVerification`
révoquait cet accès avant toute promotion — y compris la promotion que l'Inscription déclenche
elle-même, quelques secondes après que le Client a choisi son mot de passe. Le mot de passe de
chaque inscription était donc supprimé au moment exact où l'adresse était prouvée, et la modale
invitait ensuite à se connecter avec un mot de passe qui n'existait plus.

#### Décision

- **La révocation est celle de la bibliothèque.** `/sign-in/email-otp` supprime déjà les comptes
  `credential` et les sessions d'un Compte client non vérifié **avant** de le promouvoir et
  d'ouvrir sa session. C'est le seul point où la preuve d'adresse arrive d'ailleurs que de la
  session d'inscription, donc le seul où « non prouvé » veut dire quelque chose.
- **La couture maison disparaît** : `lib/revocation-acces-non-prouve.ts`, son test, et le verrou
  `lib/verification-email-frontiere.test.ts` qui figeait l'ordre fautif. Le verrou est réécrit
  pour défendre l'invariant utile — que `/sign-in/email-otp` appelle la révocation avant de
  promouvoir — au lieu de l'inverse.
- **La promotion par jeton reste hors du dispositif, et le restera tant que l'application
  n'émet aucun lien de vérification** — `emailVerification.sendVerificationEmail` n'est pas
  configuré, donc `/verify-email?token=…` n'est jamais atteint. **La réinitialisation par code
  reste dehors elle aussi** : elle remplace le secret dans le même geste, il n'y a rien à
  révoquer.

#### Options considérées

- **Garder la couture en excluant les inscriptions légitimes** — rejetée : la ligne ne porte aucun
  signal permettant de distinguer « le mot de passe que je viens de choisir » de « le mot de passe
  qu'un tiers a posé ». L'Inscription n'ouvre pas de session (`{ token: null }`), donc il n'existe
  même pas de session à comparer.
- **Révoquer à la place dans `databaseHooks.user.update`** — rejetée : le hook ne reçoit pas
  l'identifiant de la ligne visée.

#### Invariants

- Aucune promotion d'e-mail ne supprime le mot de passe de la personne qui vient de le choisir.
- Un mot de passe posé sur une adresse non prouvée ne survit pas à la preuve de cette adresse par
  un canal externe (code de connexion).
- `emailVerified` continue de vouloir dire « l'adresse est attestée » — par l'échange du code, ou
  par Facebook ou Google.

### ADR-0042 — Le limiteur d'authentification lit l'adresse client derrière Cloudflare

Le limiteur de Better Auth ne lit que `x-forwarded-for`, et refuse de conclure quand cet en-tête
porte plus d'un relais. Derrière Cloudflare puis le proxy Coolify, il en porte deux : le limiteur
retombe alors sur un compartiment unique partagé par tous les visiteurs, et la règle
« trois connexions par dix secondes » devient un plafond pour le site entier, tout en supprimant
toute protection par client.

#### Décision

- **`advanced.ipAddress.ipAddressHeaders` est configuré**, dans le même ordre de préférence que
  `adresseClient()` : `cf-connecting-ip`, puis `x-real-ip`, puis `x-forwarded-for`.
- **`trustedProxies` est renseigné** si la chaîne reste multi-relais, avec les plages Cloudflare et
  l'adresse du proxy d'hébergement — la remontée se fait de droite à gauche, on retient le premier
  relais non fiable.
- **L'ordre de préférence a un seul propriétaire** : la constante partagée avec
  `lib/limiteur-recherche.ts`, pour que la recherche et l'authentification ne divergent pas.

#### Options considérées

- **Laisser le défaut et désactiver le limiteur** — rejetée : on perdrait la seule protection
  contre le bourrage d'identifiants.
- **Limiter dans le proxy** — rejetée : la règle doit rester lisible depuis la configuration
  d'authentification, et le proxy ne connaît pas les chemins `/api/auth/*` métier.

#### Invariants

- Deux visiteurs derrière la même adresse ne partagent pas le compteur d'un troisième.
- Aucun compartiment `no-trusted-ip` n'est atteint en production ; un avertissement du limiteur
  dans les journaux est un défaut de configuration, pas un bruit.

---

## 9. How to verify

All commands assume the repo root. None of them installs anything except `npx auth` (which fetches
the CLI into the npx cache on demand; it is **not** in `devDependencies` today).

```bash
# 1. Pin the version the claims were read from
grep '"version"' node_modules/better-auth/package.json

# 2. Cookie attributes: __Secure- prefix, httpOnly, sameSite, maxAge
sed -n '20,50p' node_modules/better-auth/dist/cookies/index.mjs

# 3. Global rate-limit defaults + the special per-path rules
sed -n '169,176p' node_modules/better-auth/dist/context/create-context.mjs
sed -n '368,388p' node_modules/better-auth/dist/api/rate-limiter/index.mjs

# 4. IP resolution: the single-value rule and the x-forwarded-for default
sed -n '170,218p' node_modules/@better-auth/core/dist/utils/ip.mjs

# 5. scrypt parameters actually used at runtime
cat node_modules/@better-auth/utils/dist/password.node.mjs

# 6. OTP defaults (plaintext storage, 300 s, 3 attempts) and the plugin limits
sed -n '10,20p' node_modules/better-auth/dist/plugins/email-otp/index.mjs
sed -n '240,256p' node_modules/better-auth/dist/plugins/email-otp/routes.mjs

# 7. The revocation bug, in four reads
sed -n '318,332p' node_modules/better-auth/dist/plugins/email-otp/routes.mjs   # hook before promotion
sed -n '218,238p' node_modules/better-auth/dist/api/routes/sign-up.mjs         # credential row at sign-up
cat node_modules/better-auth/dist/db/revoke-unproven-account-access.mjs        # what the hook deletes
sed -n '424,436p' node_modules/better-auth/dist/plugins/email-otp/routes.mjs   # upstream does it on sign-in-otp

# 8. Facebook: no PKCE, and emailVerified hard-coded false
sed -n '40,58p'  node_modules/@better-auth/core/dist/social-providers/facebook.mjs
sed -n '140,150p' node_modules/@better-auth/core/dist/social-providers/facebook.mjs
sed -n '45,68p'  node_modules/@better-auth/core/dist/social-providers/google.mjs   # Google does send PKCE

# 9. The linking predicate, exactly as evaluated
sed -n '9,40p' node_modules/better-auth/dist/oauth2/link-account.mjs

# 10. What the repo itself configures (and nothing more)
grep -n "rateLimit\|secondaryStorage\|ipAddressHeaders\|storeOTP\|trustedOrigins" lib/auth.ts || echo "none set"

# 11. Schema check — the CLI compares the Prisma client model with what Better Auth writes
npx auth@latest check schema
#    and, to see the canonical schema for this config (including indexes and the rateLimit table):
npx @better-auth/cli generate
#    Both commands are fetched by npx because @better-auth/cli is not in devDependencies. The
#    generator finds the auth config by convention; confirm its prompt before letting it write.

# 12. Repository suites that touch this area
npm test -- lib/revocation-acces-non-prouve.test.ts lib/verification-email-frontiere.test.ts
npm test -- lib/auth-connexion-sociale.test.ts lib/auth-form-schemas.test.ts
```

**Proving M1 by hand** (needs the dev server and a database; not run in this pass):

1. `npm run dev`, open the Inscription modal, register `p0-probe@example.com` with any password.
2. Read the code out of the verification table — trivially possible, see M3 —
   `select value from verification where identifier = 'email-verification-otp-p0-probe@example.com';`
   and submit it in the modal.
3. Then:
   `select "providerId", "userId" from account a join "user" u on u.id = a."userId" where u.email = 'p0-probe@example.com';`
   With the current `lib/auth.ts` the result contains **no** `credential` row and `u."emailVerified"`
   is `true`. That is the whole bug: verified, and passwordless.
4. Signing in with the password then returns `401` with `INVALID_EMAIL_OR_PASSWORD`, while
   `/mot-de-passe-oublie` will re-create the `credential` row — which is why the defect reads as
   "my password stopped working" rather than as data loss.

**Proving M2** (one command against the running app, no database):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -H 'x-forwarded-for: 203.0.113.7, 10.0.0.1' \
  -d '{"email":"nonexistent@example.com","password":"wrong-password"}'
```

Four of these inside ten seconds should be `401,401,401,429` if the IP is being resolved per client,
and all four `401` (or the fourth `429` for *every* other client too) if the shared-bucket fallback
is active. The server log line to look for is
`Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket`.

---

## Unverified

Stated plainly, because none of these is load-bearing for a "must fix" above.

- **ADR-0019's premise that "Facebook requires a confirmed e-mail before it allows login."** Meta
  documents that `email` is the profile's primary address and is omitted when none is available,
  and that the deprecated `verified` flag is unrelated. I found **no** Meta statement that the
  address itself has been confirmed. The ADR's *conclusion* still holds on the linking argument in
  §3.6, but the sentence "Facebook requires a confirmed e-mail" should be softened to "Meta only
  exposes an address the account holder has on their profile", and the difference recorded.
- **Whether Facebook's limited-login ID token carries an `email_verified` claim.** Better Auth
  hard-codes `email_verified: false` on the ID-token path
  (`…/social-providers/facebook.mjs:113`) and reads `profile.email_verified` on the Graph path. I
  did not verify against Meta's docs what the limited-login token actually contains, so I cannot
  say whether that hard-code is conservative or wrong.
- **The exact HTTP surface when a Facebook profile has no e-mail.** I traced the `TypeError` at
  `…/oauth2/link-account.mjs:11` but did not exercise the callback route, so whether the wrapper
  renders Better Auth's error page, returns JSON, or fails with a 500 is not established here.
- **What the production proxy chain actually sends.** Whether `x-forwarded-for` arrives with one hop
  or several depends on Cloudflare → Coolify/Traefik configuration I could not observe from the
  repository (`proxy.ts` is Next.js middleware, not the edge proxy). M2's severity assumes the
  multi-hop case, which is the normal one; the `curl` check in §9 settles it in one request.
- **What `npx @better-auth/cli generate` emits for indexes.** The CLI is not installed here and I
  did not fetch it, so S5 is justified from the `findOne` on `(providerId, accountId)` and the
  documented identity pair, not from the generator's output.
- **KDF timing on the target hardware.** The scrypt cost comparison in §2.1 is arithmetic on the
  two published parameter sets, not a benchmark on the Coolify VPS. OWASP's own rule of thumb is
  "calculating a hash should take less than one second"; benchmark before choosing S1's parameters.
- **Anything runtime.** No server was started, no migration applied, no test executed. The two
  structural findings (M1 and M2) are source-order and source-branch determinations, which is why
  §9 gives a way to confirm each one before changing code.
