# Better Auth 1.7.18 — capability map, as documented and as shipped

> **Research-only document.** Every claim below is traced to a primary source: the official
> Better Auth documentation served for the **1.7.x** line (`https://better-auth.com/docs/llms.txt`
> is the versioned index; every page was fetched as raw Markdown by appending `.md`), the
> `better-auth/better-auth` GitHub repository (README, `CONTRIBUTING.md`, release tags), the npm
> registry, and the installed source in this checkout — `node_modules/better-auth@1.7.18` plus its
> `@better-auth/*` dependencies. All web sources were retrieved on **12 November 2026**. No
> application code, `package.json`, Prisma schema or config was modified; no package was installed,
> no migration was run, no server was started. Anything I could not confirm from a primary source is
> listed in [Unverified](#unverified).
>
> This note maps capability, it does not re-argue configuration. The eguidar-specific architecture,
> the two production defects found in 1.6.26, and the standards analysis live in
> [`backend-auth-architecture.md`](./backend-auth-architecture.md), which is pinned to
> `better-auth@1.6.26`. Section [9](#9-docversion-drift) records what changed between that version and
> this one.

## Summary

- **The headline is packaging, not features.** Of the **39 entries in the 1.7 `/docs/plugins`
  catalogue** (each plugin counted once, sub-pages ignored — the same index also documents three
  infrastructure plugins, `dash`, `audit-logs`, `sentinel`, which that count leaves out), only
  **22 ship inside `better-auth@1.7.18`**. Another **17 are separate npm packages** the docs install
  explicitly (`npm install @better-auth/passkey`, etc.) — passkey, API keys, SSO, SCIM, OAuth
  provider, MCP, CIMD, agent auth, i18n, Stripe, and seven billing/attribution plugins (Polar,
  Autumn, Dodo, Creem, Chargebee, Commet, Dub). This checkout installs only `better-auth`, so those
  capabilities are **documented but not present on disk**
  ([plugin docs index](https://better-auth.com/docs/llms.txt), `node_modules/better-auth/dist/plugins/`).
- **Four modules ship in core but are absent from the plugin catalogue — and only one of them is
  undocumented.** `custom-session` and `oauth-popup` have no `/docs/plugins/*` page (both 404 in the
  1.7 and the 1.8-beta index); `access` and `additional-fields` are helper modules rather than
  features, documented on the organization and TypeScript concept pages. Of the four, only
  `oauth-popup` appears nowhere in the docs at all. The catalogue and the tarball do not match in
  either direction (`node_modules/better-auth/package.json` exports,
  `https://better-auth.com/docs/plugins/custom-session.md` → 404).
- **The two must-fix items in the 1.6.26 note are both addressed in the checkout as it stands.** The
  client-IP problem is closed by configuration the repo now has (`advanced.ipAddress.ipAddressHeaders` +
  `trustedProxies`, `lib/auth.ts:36-43`), and 1.7 documents trusted-proxy chain walking explicitly
  ([rate-limit concepts](https://better-auth.com/docs/concepts/rate-limit)). The unproven-credential
  revocation is now **native and broader** — magic-link *and* email-OTP sign-in clear unproven
  credentials themselves ([1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#magic-link-and-email-otp-sign-in-can-clear-unproven-credentials)).
  The repo also no longer registers the harmful `beforeEmailVerification` hook at all, a fact pinned by
  a regression test that passes against 1.7.18 ([§9.2](#92-what-changed-between-1626-and-1718)).
- **The rate limiter is still the weakest documented default.** Memory storage, keyed on `ip|path`,
  with a single shared per-path bucket whenever no IP can be resolved — the library logs a warning
  saying exactly that (`node_modules/better-auth/dist/api/rate-limiter/index.mjs:245`). In a
  multi-replica deployment the counters are per process; `rateLimit.storage: "database"` or
  `secondary-storage` is the documented escape ([rate-limit storage](https://better-auth.com/docs/concepts/rate-limit#storage)).
  The storage default already follows `secondaryStorage` when one is configured — the same expression
  is in 1.6.34, so this is not a 1.7 novelty
  (`node_modules/better-auth/dist/context/create-context.mjs:175`).
- **Non-destructive secret rotation exists and is the concrete fix for a standing caveat in this
  repo.** `secrets: [{version, value}, …]` / `BETTER_AUTH_SECRETS` keeps old keys for decryption, so
  rotating `BETTER_AUTH_SECRET` no longer has to invalidate stored OAuth tokens
  ([`secrets` option](https://better-auth.com/docs/reference/options#secrets),
  [security reference](https://better-auth.com/docs/reference/security#secret-rotation)). The comment
  at `lib/auth.ts:45-47` states the old trade-off as accepted; it no longer has to be.
- **`admin()` would collide with the field this repo already owns.** The Admin plugin declares
  `user.role` itself (`node_modules/better-auth/dist/plugins/admin/schema.mjs:4-8`), while
  `lib/auth.ts:55-62` already declares `user.additionalFields.role`. Adopting Admin means merging two
  declarations of the same column — as does any plugin that adds `role`.
- **Serverless/edge is supported with named limits, not hand-waving.** The Cloudflare guide lists
  three hard constraints: `node:crypto` + `AsyncLocalStorage` need Node compatibility, a Worker cannot
  hold a `pg`/`mysql2` pool across requests, and Workers KV cannot satisfy the `secondaryStorage`
  contract ([Cloudflare guide](https://better-auth.com/docs/guides/cloudflare)).
- **Observability is on by default and telemetry is off by default** — the opposite of what the two
  words suggest. OpenTelemetry spans are emitted unless `experimental.instrumentation.enabled` is
  `false` (`node_modules/@better-auth/core/dist/instrumentation/tracer.mjs:57`); anonymous telemetry
  requires an explicit opt-in (`node_modules/@better-auth/telemetry/dist/index.mjs:362-363`).
- **1.7.18 is 4 patch releases behind at retrieval time**, and the docs site now serves three lines:
  `latest` (1.7), `beta` (1.8), `release-1.6` (`https://better-auth.com/llms.txt`, npm `dist-tags`).
  Anything read from the unversioned `/docs` URL can silently become 1.8 documentation.

---

## 1. What it is, and how it is built

### 1.1 The shape

Better Auth is a **framework-agnostic TypeScript authentication and authorization framework**: one
configuration object builds a server instance, an HTTP handler, a typed server-side API, and a typed
client SDK ([README](https://github.com/better-auth/better-auth/blob/main/README.md),
[introduction](https://better-auth.com/docs/introduction)).

Five pieces, in the order a request meets them:

| Piece | What it is | Where it lives |
|---|---|---|
| Options object | One `betterAuth({…})` call; every capability is a key or a plugin | `node_modules/better-auth/dist/index.mjs` |
| Catch-all handler | `auth.handler(request) → Response`; frameworks mount it on one route | `node_modules/better-auth/dist/index.mjs`; Next helper at `node_modules/better-auth/dist/integrations/next-js.mjs:7-20` |
| Endpoint layer | Endpoints declared with `createAuthEndpoint` on top of [`better-call`](https://github.com/bekacru/better-call); the same endpoint is a REST route *and* a typed function | `node_modules/better-auth/dist/api/`; [API concepts](https://better-auth.com/docs/concepts/api) |
| Adapter layer | ~10-method contract over a database; plugins add tables through it | `node_modules/@better-auth/{prisma,drizzle,kysely,mongo,memory}-adapter/` |
| Plugin system | `id` + optional `schema`, `endpoints`, `hooks`, `middlewares`, `rateLimit`, `$Infer` | [plugins concepts](https://better-auth.com/docs/concepts/plugins), `node_modules/better-auth/dist/types/plugins.d.mts` |

The handler is the whole framework story on the server: `toNextJsHandler(auth)` returns
`{GET, POST, PATCH, PUT, DELETE}` all pointing at the same function
(`node_modules/better-auth/dist/integrations/next-js.mjs:7-20`). Nothing about authentication is
Next-specific; the framework pages only differ in how that one function is mounted and how cookies
are flushed.

### 1.2 Frameworks and runtimes the 1.7 docs cover

Every entry below is a page in the versioned index ([docs index](https://better-auth.com/docs/llms.txt)):

| Family | Integrations |
|---|---|
| Full-stack | Next.js, SvelteKit, Nuxt, Astro, React Router v7 (formerly Remix), SolidStart, TanStack Start, Waku, Electron |
| Backend | Hono, Express, Fastify, Elysia, NestJS, Nitro, Effect, Encore, Convex |
| Mobile / desktop | Expo (React Native), Lynx |
| Databases | PostgreSQL, MySQL, SQLite, MS SQL, other relational; Drizzle, Prisma, MongoDB adapters; community adapters |

The peer-dependency set shipped with 1.7.18 is the machine-readable version of that table: `next`
`^14 || ^15 || ^16`, `@sveltejs/kit` `^2 || ^3`, `@tanstack/react-start` `^1`,
`@tanstack/solid-start` `^1`, `react`/`react-dom` `^18 || ^19`, `vue` `^3`, `svelte` `^4 || ^5`,
`solid-js` `^1`, `@lynx-js/react`, `prisma` `^5 || ^6 || ^7`, `@prisma/client` `^5 || ^6 || ^7`,
`drizzle-orm` `^0.45.2 || >=1.0.0-rc.1 <2.0.0`, `kysely` (a plain dependency, not a peer), `mongodb`
`^6 || ^7` — all optional ([registry.npmjs.org/better-auth](https://registry.npmjs.org/better-auth),
version `1.7.18`). Note `next@16` and `prisma@7` are inside the declared ranges, which matters here.

### 1.3 Serverless and edge: what the docs actually constrain

The docs do not claim "works everywhere". They enumerate four limits, all on the Cloudflare page
([Cloudflare guide](https://better-auth.com/docs/guides/cloudflare)):

1. **Node built-ins.** Better Auth uses `node:crypto` and `AsyncLocalStorage`; Workers need
   `nodejs_compat` (on by default from compatibility date `2026-08-04`).
2. **`process.env`.** With Node compatibility, Workers populate `process.env` from date `2025-04-01`;
   before that, pass `env` explicitly.
3. **No I/O across requests.** "Workers don't allow I/O across requests, so an auth instance at module
   scope cannot hold a client that keeps connections open, such as a `pg` or `mysql2` pool, even
   through Hyperdrive." An HTTP-based driver is required.
4. **KV is not secondary storage.** It "is eventually consistent, cannot expire a key sooner than 60
   seconds, and has no atomic operations, so it cannot meet the `secondaryStorage` contract."

Deferred work has a documented seam: `advanced.backgroundTasks.handler`, fed `waitUntil` on Workers
([options reference](https://better-auth.com/docs/reference/options#backgroundtasks)). The email
verification page repeats the constraint for the send-email path: "On serverless platforms, use
`waitUntil` or similar" ([email & password](https://better-auth.com/docs/authentication/email-password)).

The CLI has its own floor: "The `auth` CLI requires Node.js 22.12 or newer"
([1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide)). The run-time library
floor is not stated on the pages read — see [Unverified](#unverified).

---

## 2. Core authentication primitives

Core means: present with no plugin, configured directly on `betterAuth({…})`.

| Primitive | Status in 1.7.18 | Key options / endpoints | Source |
|---|---|---|---|
| Email + password | core | `emailAndPassword.enabled`, `minPasswordLength` (8), `maxPasswordLength` (128), `autoSignIn`, `requireEmailVerification`, `revokeSessionsOnPasswordReset`, `password.{hash,verify}` | `create-context.mjs:186-187`, [email-password docs](https://better-auth.com/docs/authentication/email-password) |
| Password hashing | core, scrypt | default `scrypt`, replaceable per-app; docs justify the choice ("natively supported by Node.js") | [security reference](https://better-auth.com/docs/reference/security#password-hashing), [email-password config](https://better-auth.com/docs/authentication/email-password#configuration) |
| E-mail verification | core | `emailVerification.sendVerificationEmail`, `sendOnSignUp`, `autoSignInAfterVerification`, `beforeEmailVerification`, `onEmailVerification` | `node_modules/better-auth/dist/api/routes/email-verification.mjs:286-289` |
| Password reset | core | `/request-password-reset`, `/reset-password`; `onPasswordReset`, `revokeSessionsOnPasswordReset` | [users & accounts](https://better-auth.com/docs/concepts/users-accounts), `init-options.d.mts:757-793` |
| Change e-mail / change password / set password / verify password | core | `changeEmail`, `changePassword({revokeOtherSessions})`, `setPassword`, `verifyPassword` | [users & accounts](https://better-auth.com/docs/concepts/users-accounts) |
| Sessions | core | table `session`; `expiresIn` 7 d, `updateAge` 1 d, `freshAge` 1 d; `disableSessionRefresh`, `deferSessionRefresh` | `create-context.mjs:147-149`, [session docs](https://better-auth.com/docs/concepts/session-management) |
| Session revocation / multi-device | core | `listSessions`, `revokeSession`, `revokeOtherSessions`, `revokeSessions` | [session docs](https://better-auth.com/docs/concepts/session-management#revoke-session) |
| Account linking | core, **on by default** | `account.accountLinking.{enabled, trustedProviders, allowDifferentEmails, disableImplicitLinking}` | [OAuth concepts](https://better-auth.com/docs/concepts/oauth), [users & accounts](https://better-auth.com/docs/concepts/users-accounts#account-linking) |
| Social providers | core | `socialProviders.{google,facebook,…}`; 36 provider ids shipped | `node_modules/@better-auth/core/dist/social-providers/index.mjs:80` |
| Generic OAuth / OIDC | core plugin (`genericOAuth`) | any OAuth2/OIDC provider + provider helpers | §3.1 |
| Username | plugin | `username()`, extends email+password | [username docs](https://better-auth.com/docs/plugins/username) |
| Phone number | plugin | `phoneNumber({sendOTP})` | [phone-number docs](https://better-auth.com/docs/plugins/phone-number) |
| Anonymous | plugin | `anonymous()` | [anonymous docs](https://better-auth.com/docs/plugins/anonymous) |
| Magic link | plugin | `magicLink({sendMagicLink})` | [magic-link docs](https://better-auth.com/docs/plugins/magic-link) |
| E-mail OTP | plugin | `emailOTP({sendVerificationOTP})` | [email-otp docs](https://better-auth.com/docs/plugins/email-otp) |
| Passkeys / WebAuthn | **separate package** `@better-auth/passkey` | `passkey({rpID, rpName, origin})` | [passkey docs](https://better-auth.com/docs/plugins/passkey) |
| SSO (SAML + OIDC) | **separate package** `@better-auth/sso` | `sso({…})`, per-provider registration | [SSO docs](https://better-auth.com/docs/plugins/sso) |
| OAuth 2.1 / OIDC **provider** | **separate package** `@better-auth/oauth-provider` | `oauthProvider({loginPage, consentPage, scopes, resources})` | [oauth-provider docs](https://better-auth.com/docs/plugins/oauth-provider) |

### 2.1 Sessions: cookie, cache, expiry

The session cookie is derived, not hard-coded
(`node_modules/better-auth/dist/cookies/index.mjs:20-72`):

- Name is `${prefix}.${cookie}` with `prefix` default `"better-auth"`, so `better-auth.session_token`;
  under an `https://` base URL the `__Secure-` prefix is added, giving
  `__Secure-better-auth.session_token` (`:23`, `:29-30`).
- Attributes: `secure` iff the prefix applies, `sameSite: "lax"`, `path: "/"`, `httpOnly: true`
  (`:33-38`). `maxAge` for the session token equals `session.expiresIn` (`:49`).
- `advanced.cookies[name].{name,attributes}` overrides name and attributes; `cookiePrefix` and
  `defaultCookieAttributes` are the coarser knobs ([options reference](https://better-auth.com/docs/reference/options#advanced)).

Cookie cache is **off by default**. When enabled it writes a second cookie, `session_data`
(`maxAge` default 300 s), in one of three strategies — `compact` (base64url + HMAC-SHA256, default),
`jwt` (HS256, or JWKS if the `jwt()` plugin is installed with `sessionCookieCache`), `jwe`
(A256CBC-HS512 + HKDF, encrypted) ([session docs](https://better-auth.com/docs/concepts/session-management#cookie-cache-strategies)).
The docs state the trade-off plainly: with cookie cache on, "revoked sessions may remain active on
other devices until the cookie cache expires".

Sessions can be moved to secondary storage while staying in the database
(`storeSessionInDatabase`, `preserveSessionInDatabase`), or dropped entirely for stateless
cookie-cache sessions ([session docs](https://better-auth.com/docs/concepts/session-management#sessions-in-secondary-storage)).

### 2.2 Social providers: the 36 that ship in core

`apple, atlassian, cloudflare, cognito, discord, dropbox, facebook, figma, github, gitlab, google,
huggingface, kakao, kick, line, linear, linkedin, microsoft, naver, notion, paybin, paypal, polar,
railway, reddit, roblox, salesforce, slack, spotify, tiktok, twitch, twitter, vercel, vk, wechat,
zoom` — the exported set at `node_modules/@better-auth/core/dist/social-providers/index.mjs:80`, and
the same 36 pages exist under `https://better-auth.com/docs/authentication/*`
([docs index](https://better-auth.com/docs/llms.txt)). Microsoft lives in `microsoft-entra-id.mjs`
and is exported twice (`microsoft`, plus the Generic OAuth helper `microsoftEntraId`) — 1.7 migrated
Microsoft accounts to the `oid` claim, which is a data migration, not a code change
([upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#migrate-microsoft-account-identifiers)).

Provider options that matter when hardening: `scope` + `disableDefaultScope`, `mapProfileToUser`,
`disableImplicitSignUp`, `disableSignUp`, `requireEmailVerification` (per provider, opt-in),
`overrideUserInfoOnSignIn`, `prompt`, `responseMode`, `refreshAccessToken`, `getUserInfo`
([OAuth concepts](https://better-auth.com/docs/concepts/oauth#provider-options)).

Account linking logic is fixed, not configurable in its core rule: link when the provider confirms a
verified e-mail, or when the provider is listed in `trustedProviders`; `disableImplicitLinking`
turns the automatic branch off entirely and rejects with `account_not_linked`
([users & accounts](https://better-auth.com/docs/concepts/users-accounts#disable-implicit-linking),
[errors](https://better-auth.com/docs/reference/errors/account_not_linked)).

---

## 3. Plugin catalogue

Three facts drive this section:

1. The 1.7 docs give each plugin its own page, and every page for a plugin that lives outside the
   core opens with the install command for that package (`npm install @better-auth/passkey`, etc.) ([docs index](https://better-auth.com/docs/llms.txt)).
2. `better-auth@1.7.18` bundles **26** plugin modules under `node_modules/better-auth/dist/plugins/`,
   and its `dependencies` contain **no** plugin packages — only the five adapters, `core`,
   `telemetry`, `utils` ([registry.npmjs.org/better-auth](https://registry.npmjs.org/better-auth),
   `node_modules/@better-auth/` contains exactly those).
3. So "documented capability" and "installed capability" are different sets, and the difference is
   one `npm install` per plugin, at a version whose peer range is `better-auth: ^1.7.18`
   ([registry.npmjs.org/@better-auth/passkey/1.7.18](https://registry.npmjs.org/@better-auth/passkey/1.7.18)).

### 3.1 Shipped inside `better-auth@1.7.18` (22 documented)

Import from `better-auth/plugins` (subpaths such as `better-auth/plugins/email-otp` also exist; the
full export map is in `node_modules/better-auth/package.json`).

| Plugin | One-line purpose | Key options (from the type) |
|---|---|---|
| `twoFactor` | TOTP + e-mail OTP second factor, backup codes | `issuer`, `twoFactorTable`, `totpOptions`, `otpOptions`, `backupCodeOptions`, `skipVerificationOnEnable`, `allowPasswordless`, `trustDeviceMaxAge`, `accountLockout` |
| `username` | Username sign-in on top of email + password | `minUsernameLength`, `maxUsernameLength`, `usernameValidator`, `displayUsernameValidator`, `displayUsername`, `validationOrder` |
| `anonymous` | Guest sessions that can later be linked | `onLinkAccount`, `generateName`, `emailDomainName`, `disableDeleteAnonymousUser` |
| `phoneNumber` | SMS OTP sign-in / verification | `sendOTP`, `otpLength`, `expiresIn`, `requireVerification`, `phoneNumberValidator`, `signUpOnVerification` |
| `magicLink` | One-click e-mail link sign-in | `sendMagicLink`, `expiresIn`, `allowedAttempts`, `disableSignUp`, `storeToken`, `rateLimit` |
| `emailOTP` | Codes for verification, sign-in, reset, e-mail change | `sendVerificationOTP`, `otpLength` (6), `expiresIn` (300), `storeOTP` (`"plain"`), `allowedAttempts` (3), `resendStrategy`, `overrideDefaultEmailVerification` |
| `genericOAuth` | Any OAuth2/OIDC provider, plus helpers (`auth0`, `keycloak`, `okta`, `microsoftEntraId`, `line`, `slack`, `hubspot`, `patreon`, `gumroad`, `yandex`) | `config[]` with `providerId`, `discoveryUrl`/endpoints, `pkce` (on by default in 1.7), `mapProfileToUser` |
| `oneTap` | Google One Tap | `clientId` |
| `siwe` | Sign-In With Ethereum | nonce config, ERC-4361 message parsing |
| `admin` | Roles, banning, impersonation | `defaultRole`, `adminRoles`, `adminUserIds`, `impersonationSessionDuration`, `defaultBanReason`, `allowImpersonatingAdmins` |
| `organization` | Orgs, members, teams, invitations, roles | `allowUserToCreateOrganization`, `organizationLimit`, `membershipLimit`, `creatorRole`, `ac`, `roles`, `teams`, `dynamicAccessControl` |
| `deviceAuthorization` | RFC 8628 device grant (TV/CLI sign-in) | `generateDeviceCode`, `generateUserCode`, `validateClient`, `verificationUri` |
| `bearer` | `Authorization: Bearer <session token>` instead of cookies | — |
| `captcha` | Bot check in front of chosen endpoints | `secretKey`, `provider` (reCAPTCHA / Turnstile / hCaptcha / CaptchaFox / Vercel BotID), `endpoints`, `expectedAction`, `allowedHostnames`, `minScore`, `validateRequest` (BotID only) |
| `haveIBeenPwned` | Reject breached passwords (k-anonymity) | `paths`, `customPasswordCompromisedMessage`, `enabled` |
| `lastLoginMethod` | Remember/display the last method used | resolver override, cookie name |
| `multiSession` | Several accounts active in one browser | cookie-based, no options |
| `oauthProxy` | OAuth on preview deployments behind a stable origin | redirect/proxy options |
| `oneTimeToken` | Single-use tokens (e.g. hand-off between apps) | token config |
| `openAPI` | OpenAPI reference UI for the auth endpoints | `path`, theme |
| `jwt` | JWKS + JWT issuance for non-cookie consumers | `jwks.{keyPairConfig, rotationInterval, gracePeriod}`, `jwt.{issuer, audience, expirationTime, definePayload}` |
| `testUtils` | Helpers for integration/E2E tests | test user/cookie helpers |

Sources for the options column: the per-plugin `types.d.mts` in
`node_modules/better-auth/dist/plugins/*/`, e.g. `email-otp/types.d.mts`,
`two-factor/types.d.mts`, `admin/types.d.mts`, `organization/types.d.mts`,
`captcha/types.d.mts`; defaults confirmed at `email-otp/index.mjs:13-17` (`expiresIn: 300`,
`storeOTP: "plain"`) and `email-otp/routes.mjs:755` (`allowedAttempts || 3`).

### 3.2 Shipped inside core but **not** in the 1.7 docs catalogue (4)

| Module | What it is | Evidence |
|---|---|---|
| `customSession(fn, options?, pluginOptions?)` | A server plugin that rewrites the `/get-session` response through your function — a supported replacement for hand-editing the session payload | `node_modules/better-auth/dist/plugins/custom-session/index.mjs:8`; `https://better-auth.com/docs/plugins/custom-session.md` → **404** |
| `oauthPopup()` | Popup-window OAuth flow (postMessage, own error codes, CSP script hash export) | `node_modules/better-auth/dist/plugins/oauth-popup/index.mjs`; `…/plugins/oauth-popup.md` → **404** |
| `createAccessControl`, `role` (`plugins/access`) | The permission primitives `admin` and `organization` are built on, exported for reuse. `hasPermission` is **not** here: it lives in `plugins/organization/has-permission.mjs` and is re-exported from `better-auth/plugins` | `node_modules/better-auth/dist/plugins/access/index.mjs:1`; `node_modules/better-auth/dist/plugins/index.mjs:43,50` |
| `inferAdditionalFields` (`plugins/additional-fields`) | *Client* plugin that types `additionalFields` on the client | `node_modules/better-auth/dist/plugins/additional-fields/client.mjs:4-11` |

None of the four has a page in the 1.7 index **or** in the 1.8-beta index
(`https://better-auth.com/docs/beta/llms.txt`), so this is a catalogue gap, not a version gap. But
"no plugin page" is not "undocumented": `customSession` is documented under
[session management](https://better-auth.com/docs/concepts/session-management) (a `customSession`
subsection with its own code sample), `createAccessControl` under
[organization](https://better-auth.com/docs/plugins/organization#access-control), and
`inferAdditionalFields` under [TypeScript](https://better-auth.com/docs/concepts/typescript). Only
`oauth-popup` is genuinely absent from the documentation.

### 3.3 Documented, but a separate npm package (17)

None of these is a dependency of `better-auth@1.7.18`; each is installed by the command on its own
docs page. Versions are the current `latest` at retrieval. **Every `@better-auth/*` package on the
1.7 train has a 1.7.18 release**, so those can be pinned to the installed core; `agent-auth` and the
third-party billing packages are on their own version lines and cannot be pinned that way.

| Capability | Package | Latest @ 12 Nov 2026 | Notes |
|---|---|---|---|
| Passkeys / WebAuthn | `@better-auth/passkey` | 1.7.22 | pulls `@simplewebauthn/{server,browser}` |
| API keys | `@better-auth/api-key` | 1.7.22 | has its own `advanced` options page and reference |
| SSO (SAML 2.0 + OIDC) | `@better-auth/sso` | 1.7.22 | pulls `samlify`, `@xmldom/xmldom`, `fast-xml-parser`, `tldts` |
| SCIM provisioning | `@better-auth/scim` | 1.7.22 | needs `sso` alongside; `scim` requires full re-provisioning from 1.6 |
| OAuth 2.1 / OIDC **provider** | `@better-auth/oauth-provider` | 1.7.22 | replaces the removed `oidcProvider` plugin; consent/login pages required |
| MCP (OAuth for MCP clients) | `@better-auth/mcp` | 1.7.22 | installed with `@better-auth/cimd` |
| CIMD (client metadata documents) | `@better-auth/cimd` | 1.7.22 | |
| Agent auth (AI agent identities) | `@better-auth/agent-auth` | **0.6.2** | **independently versioned** — no 1.7.x exists |
| i18n (translated error messages) | `@better-auth/i18n` | 1.7.22 | |
| Stripe subscriptions | `@better-auth/stripe` | 1.7.22 | needs `stripe@^23` |
| Polar | `@polar-sh/better-auth` | 2.1.4 | third-party |
| Autumn billing | `autumn-js` | 1.5.79 | third-party; plugin entry `autumn-js/better-auth` |
| Dodo Payments | `@dodopayments/better-auth` | 1.6.7 | third-party |
| Creem | `@creem_io/better-auth` | 2.0.5 | third-party |
| Chargebee | `@chargebee/better-auth` | 1.3.0 | third-party |
| Commet | `@commet/better-auth` | 8.1.0 | third-party |
| Dub (lead attribution) | `@dub/better-auth` | 0.0.6 (2025-10-06) | third-party, unchanged for over a year |

Install commands are quoted from the docs pages themselves
(`https://better-auth.com/docs/plugins/{passkey,api-key,sso,scim,oauth-provider,mcp,cimd,agent-auth,i18n,stripe,polar,autumn,dodopayments,creem,chargebee,commet,dub}`),
package versions from `https://registry.npmjs.org/<package>`. The `better-auth` peer range on the
`@better-auth/*` set is visible per version, e.g.
[`@better-auth/passkey/1.7.18`](https://registry.npmjs.org/@better-auth/passkey/1.7.18).

**Peers move with the patch, so pin deliberately.** `@better-auth/passkey@1.7.18` peers
`better-auth@^1.7.18` and installs against this checkout as-is; `@better-auth/passkey@1.7.22` peers
`^1.7.22`. Installing `latest` therefore either resolves to the 1.7.22 plugin (and asks for a core
bump) or is pinned back by the package manager. "Install the plugin" and "install the plugin without
touching `better-auth`" are two different commands.

### 3.4 The plugin contract

A server plugin is an object with a required unique `id` and any of: `schema`, `endpoints`,
`hooks.{before,after}`, `middlewares`, `onRequest`/`onResponse`, `rateLimit`, `$Infer`,
`init`, `adapter` (`node_modules/@better-auth/core/dist/types/plugin.d.mts`). Reusable plugins can
augment `BetterAuthPluginRegistry` so `getPlugin("id")` returns the exact type — the registry key must
match `id` ([plugins concepts](https://better-auth.com/docs/concepts/plugins#register-a-plugin-type)).

**A documentation bug worth knowing before writing a plugin:** the docs example declares
`rateLimit: [{ pathMatcher, limit: 10, window: 60 }]`
([plugins concepts](https://better-auth.com/docs/concepts/plugins#rate-limit)), but the type is
`{ window, max, pathMatcher }` and the limiter reads `rule.max`
(`node_modules/@better-auth/core/dist/types/plugin.d.mts:109-113`,
`node_modules/better-auth/dist/api/rate-limiter/index.mjs:254-259`). `limit` is silently ignored.

---

## 4. Adapters, schema and migrations

### 4.1 The contract and the five built-ins

An adapter is a small object of model-scoped methods (`create`, `findOne`, `findMany`, `update`,
`updateMany`, `delete`, `deleteMany`, `count`, with optional atomic `incrementOne`/`consumeOne`)
plus an `id` naming the dialect ([database concepts](https://better-auth.com/docs/concepts/database),
[custom adapter guide](https://better-auth.com/docs/guides/create-a-db-adapter)). Five ship as
separate packages and are re-exported through `better-auth/adapters/*`:

| Adapter | Package | Notes |
|---|---|---|
| Prisma | `@better-auth/prisma-adapter` | `provider` is **required** and is one of `sqlite \| cockroachdb \| mysql \| postgresql \| sqlserver \| mongodb`; `usePlural` and `transaction` default `false` (`node_modules/@better-auth/prisma-adapter/dist/index.d.mts:8-28`) |
| Drizzle | `@better-auth/drizzle-adapter` | relation keys become singular with `usePlural` in 1.7 |
| Kysely | `@better-auth/kysely-adapter` | the only adapter `auth migrate` can act on |
| MongoDB | `@better-auth/mongo-adapter` | ObjectId conventions |
| Memory | `@better-auth/memory-adapter` | tests |

### 4.2 Prisma specifics

- `prismaAdapter(prisma, { provider: "postgresql" })` — the provider string is a literal union, not a
  free-form dialect name (`@better-auth/prisma-adapter/dist/index.d.mts:8`).
- **Schema generation, not migration.** The CLI writes into `prisma/schema.prisma`; the docs table marks
  "Prisma Schema Generation ✅ / Prisma Schema Migration ❌" and then tells you to run
  `npx prisma migrate dev` + `npx prisma generate` yourself
  ([Prisma adapter](https://better-auth.com/docs/adapters/prisma#schema-generation--migration)).
- **Joins** are available "out of the box since version `1.4.0`" behind
  `advanced.database.joins: true` (moved out of `experimental.joins` in 1.7), and require relations in
  the generated schema ([Prisma adapter](https://better-auth.com/docs/adapters/prisma#joins),
  [upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#database-joins-moved-out-of-experimental)).
- `transaction: false` by default means multi-step writes are not wrapped unless you opt in
  (`@better-auth/prisma-adapter/dist/index.d.mts:20-28`); the password-change documentation describes
  the transactional vs non-transactional failure modes explicitly
  ([session docs](https://better-auth.com/docs/concepts/session-management#revoking-sessions-on-password-change)).

### 4.3 Secondary storage

```ts
interface SecondaryStorage {
  get(key): Promise<unknown>
  getAndDelete(key): Promise<unknown>
  increment(key, ttl: number): Promise<number>
  set(key, value, ttl?): Promise<void>
  delete(key): Promise<void>
}
```

`increment` and `getAndDelete` were optional and are **required in 1.7**; the rate limiter uses them
([database concepts](https://better-auth.com/docs/concepts/database#secondary-storage),
[upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#secondary-storage-must-implement-increment-and-getanddelete)).
The official Redis package is `@better-auth/redis-storage` (with `ioredis`)
([database concepts](https://better-auth.com/docs/concepts/database#redis-storage)). What it holds:
sessions, verification records, **and rate-limit counters**
([options reference](https://better-auth.com/docs/reference/options#secondarystorage)).

### 4.4 The CLI

The command is `npx auth@latest <cmd>` — package **`auth`** ("The CLI for Better Auth", latest
1.7.22), *not* `@better-auth/cli`, which npm lists as **deprecated** ("Package no longer supported",
last version 1.4.21, March 2026) ([registry.npmjs.org/auth](https://registry.npmjs.org/auth),
[registry.npmjs.org/@better-auth/cli](https://registry.npmjs.org/@better-auth/cli)). Commands, from
the [CLI page](https://better-auth.com/docs/concepts/cli):

| Command | Purpose | Constraint |
|---|---|---|
| `generate` | Emit the schema for your adapter (`prisma/schema.prisma`, `schema.ts`, or `schema.sql`) | does not apply it |
| `migrate` | Create/update tables | built-in Kysely adapter only |
| `check` / `check schema` | Verify the configured schema can hold what Better Auth writes | Prisma/Drizzle checks read the generated model, not the live DB |
| `create-admin` | Create an initial admin | **requires the Admin plugin** |
| `init` | Scaffold a project | — |
| `upgrade` | Bump `better-auth` + `@better-auth/*` in lockstep to the CLI's version | "Independently versioned packages, such as `@better-auth/utils`, are not changed" |
| `info` | Diagnostics | — |
| `secret` | Generate a secret | — |

### 4.5 `additionalFields`, custom naming, IDs

- `user.additionalFields` / `session.additionalFields` declare extra columns with
  `type`, `required`, `defaultValue`, `input` (whether a client may set it), `fieldName` and
  `transform` ([database concepts](https://better-auth.com/docs/concepts/database#extending-core-schema)).
  Typed on the client by `inferAdditionalFields` from `better-auth/client/plugins` or
  `better-auth/plugins`.
- Table/column renaming: `modelName` per model, `fields: { … }` per column, at the top level and in
  each plugin's `schema` ([database concepts](https://better-auth.com/docs/concepts/database#custom-tables)).
- ID generation: `advanced.database.generateId` — a function, `false` (DB generates), `"serial"`, or
  `"uuid"`; `advanced.database.defaultFindManyLimit` (100) and `validateSchema` also live there
  ([options reference](https://better-auth.com/docs/reference/options#advanced)).
- **`validateSchema` is on by default** and the adapter can answer "can this schema hold what the
  config writes" at request time — `ctx.checkSchema` exists for that
  (`node_modules/@better-auth/core/dist/types/context.d.mts:283-292`).

---

## 5. Security capabilities

### 5.1 Rate limiting

| Property | Value in 1.7.18 | Source |
|---|---|---|
| Default window / max | 10 s / 100 requests | `create-context.mjs:173-174` |
| Enabled by default | only when `NODE_ENV === "production"` (`?? isProduction`) | `create-context.mjs:172` |
| Stricter rules | `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*` → **3 / 10 s**; `/request-password-reset`, `/send-verification-email`, `/forget-password*`, `/email-otp/send-verification-otp`, `/email-otp/request-password-reset` → **3 / 60 s** | `rate-limiter/index.mjs:305-320` |
| Storage | `"memory"` (default), `"database"` (model `rateLimit`), `"secondary-storage"`, or `customStorage.consume(key, rule)` | `create-context.mjs:175`, [rate-limit docs](https://better-auth.com/docs/concepts/rate-limit#storage) |
| Key | `` `${ip}\|${path}` `` (no spaces; when no IP resolves the first segment is `no-trusted-ip`) | `node_modules/@better-auth/core/dist/utils/ip.mjs:228-229` |
| get/set replaced | the whole check-and-increment is one atomic `consume` | `node_modules/better-auth/dist/api/rate-limiter/index.mjs:287-302` |

The docs describe the per-path rules as `/sign-in/email`: 3/10 s
([rate-limit docs](https://better-auth.com/docs/concepts/rate-limit)); the code matches the wider
`startsWith("/sign-in")` family, so the docs understate their own default.

Server-side `auth.api.*` calls are **not** rate limited — "Rate limits only apply to client-initiated
requests" ([rate-limit docs](https://better-auth.com/docs/concepts/rate-limit)).

### 5.2 IP resolution and trusted proxies

`getIP` walks `advanced.ipAddress.ipAddressHeaders` in order (default `["x-forwarded-for"]`), and for
each header:

- if `trustedProxies` is non-empty, it walks the comma-separated chain **right to left**, skipping
  trusted hops, and returns the first untrusted address (`ip.mjs:180-189`);
- if it is empty, a header with **more than one** entry yields `null` — the leftmost token is
  spoofable, so a multi-value header is not trusted (`ip.mjs:190-192`);
- `disableIpTracking` short-circuits everything to `null`, and when it is set and no IP resolves the
  HTTP limiter returns early instead of bucketing everything together (`ip.mjs:203-221`,
  `rate-limiter/index.mjs:243`); in dev/test the address falls back to `127.0.0.1`.

When no IP resolves, the limiter keys on `no-trusted-ip|path` and logs
`"Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket…"`
(`rate-limiter/index.mjs:245`). IPv6 is normalized per subnet (`ipv6Subnet`), so a `/64` cannot be
rotated for free ([rate-limit docs](https://better-auth.com/docs/concepts/rate-limit)).

### 5.3 CSRF, origins, cookies

Four layers, documented and traceable
([security reference](https://better-auth.com/docs/reference/security#csrf-protection)):

1. **Avoid simple requests** — JSON content type or a non-simple header on state-changing routes.
2. **Origin validation** — `Origin` checked against `trustedOrigins` (base URL by default); an
   `Origin: null` form post is accepted only when `Sec-Fetch-Site` proves same-origin.
3. **`SameSite=Lax`** session cookies, overridable via `defaultCookieAttributes`.
4. **Fetch Metadata for first login** — cookie-less sign-in/sign-up requests that look like cross-site
   navigations are blocked.

`trustedOrigins` also gates redirect targets: relative callbacks must start with a single `/`, and
protocol-relative URLs, backslashes, control characters and encoded path separators are rejected
([security reference](https://better-auth.com/docs/reference/security#trusted-origins)). Two switches
turn this off and are marked as security risks in the options reference: `advanced.disableCSRFCheck`
and `advanced.disableOriginCheck`
([options reference](https://better-auth.com/docs/reference/options#advanced)).

### 5.4 Secrets and rotation

- `BETTER_AUTH_SECRET` (or `secret`) is required; `npx auth@latest secret` generates one
  ([installation](https://better-auth.com/docs/installation)).
- `secrets: [{version, value}, …]` or `BETTER_AUTH_SECRETS=2:new,1:old` makes rotation
  **non-destructive**: new writes use the first key with a version tag, decryption does a direct
  lookup, legacy bare-hex data still decrypts with `secret`, and data is lazily re-encrypted on the
  next write ([options reference](https://better-auth.com/docs/reference/options#secrets),
  [security reference](https://better-auth.com/docs/reference/security#secret-rotation)).
- Caveat stated in both places: moving from a shared key to purpose-specific keys changes the format
  of pending OAuth/SAML state cookies and OAuth Proxy payloads — in-flight flows must restart.

### 5.5 OAuth tokens, state and outbound requests

- `account.encryptOAuthTokens` (default `false`) encrypts access/refresh/id tokens at rest with a key
  derived from the secret ([options reference](https://better-auth.com/docs/reference/options#encryptoauthTokens)).
  The "users & accounts" page still says tokens are not encrypted by default and suggests
  `databaseHooks` instead — the option page is the correct one.
- `account.storeStateStrategy`: `"database"` (default when a DB or secondary storage exists) or
  `"cookie"` ([options reference](https://better-auth.com/docs/reference/options#storestatestrategy)).
- Outbound OAuth calls **do not follow redirects**, by design: "Refusing redirects keeps a provider
  endpoint from steering a server-side request to an unintended internal address"
  ([security reference](https://better-auth.com/docs/reference/security#outbound-oauth-requests)).
- SSRF host classification blocks additional reserved ranges as of 1.7
  ([upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#behavior-changes-worth-noticing)).

### 5.6 Password checks

- **Hashing** is `scrypt` by default and replaceable via `emailAndPassword.password.{hash,verify}`
  ([security reference](https://better-auth.com/docs/reference/security#password-hashing)). Better
  Auth itself ships no rehash-on-login; the seam is the custom `verify` function — a caller can
  compare the stored parameters and rewrite the hash there.
- **Breach check**: `haveIBeenPwned` sends only the **first five characters of the SHA-1** to
  `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true`, and compares the remaining
  suffix locally (`node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs:20-38`). Default
  protected paths: `/sign-up/email`, `/change-password`, `/reset-password`,
  `/email-otp/reset-password`, `/phone-number/reset-password`, `/admin/create-user`,
  `/admin/set-user-password` (`…/index.mjs:51-59`). A network failure surfaces as
  `INTERNAL_SERVER_ERROR` — **fail-closed**, per the `throw` at `…/index.mjs:34-37`.
- **Captcha**: five providers in one plugin, `endpoints` matching full paths with `*`/`**` wildcards
  (changed in 1.7), and `expectedAction` + `allowedHostnames` on the Cloudflare/reCAPTCHA variants
  (`node_modules/better-auth/dist/plugins/captcha/types.d.mts:21,26,34,39`,
  [upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#captcha-matches-full-paths)).
  There is **no general per-request predicate**: `validateRequest` exists only on
  `VercelBotIdOptions` (`types.d.mts:89`) and is only passed when
  `provider === "vercel-botid"` (`captcha/index.mjs:30-34`). `expectedAction` is **one string per
  configuration**, not per endpoint — relevant to §10.

### 5.7 Telemetry and instrumentation

| | Default | How to change it | Source |
|---|---|---|---|
| Anonymous telemetry | **off** — `options.telemetry?.enabled ?? false`, and `BETTER_AUTH_TELEMETRY` is also false by default | `telemetry: {enabled: true}` or `BETTER_AUTH_TELEMETRY=1`; debug with `BETTER_AUTH_TELEMETRY_DEBUG=1` | `node_modules/@better-auth/telemetry/dist/index.mjs:362-363`; [telemetry](https://better-auth.com/docs/reference/telemetry) |
| OpenTelemetry spans | **on** — `enabled === false ? noop : withSpan` | `experimental.instrumentation.enabled: false` | `node_modules/@better-auth/core/dist/instrumentation/tracer.mjs:57`; [instrumentation](https://better-auth.com/docs/reference/instrumentation) |

Spans cover endpoints, before/after hooks, plugin middleware, and every DB operation
(`db {operation} {model}`), with attributes like `http.route`, `better_auth.operation_id`,
`db.collection.name`. Collection only happens if the app configures a `TracerProvider` and exporter;
`@opentelemetry/api` is an **optional peer** of `@better-auth/core`
(`node_modules/@better-auth/core/package.json`).

---

## 6. Client and server APIs

### 6.1 Server

`auth.api` exposes every endpoint, core and plugin, as a typed function
([API concepts](https://better-auth.com/docs/concepts/api)):

```ts
await auth.api.getSession({ headers: await headers() })
await auth.api.signInEmail({ body: { email, password }, headers })
await auth.api.verifyEmail({ query: { token } })
```

- `returnHeaders: true` → `{ headers, response }`, with `headers.getSetCookie()`.
- `asResponse: true` → a `Response`.
- Errors are thrown as `APIError`; `isAPIError` narrows (`better-auth/api`).

### 6.2 Client

`createAuthClient` from `better-auth/client`, with framework entry points in the export map:
`./react`, `./vue`, `./svelte`, `./solid`, `./lynx`, `./tanstack-start`, `./svelte-kit`
(`node_modules/better-auth/package.json` exports). Hooks (`useSession`), fetch options, error
handling, SSR hydration and client plugins are documented on the
[client page](https://better-auth.com/docs/concepts/client). The React hook is explicitly *not* for
layouts: "For performance reasons, do not use this hook on your `layout.tsx`" — use
`auth.api.getSession` in RSC ([FAQ](https://better-auth.com/docs/reference/faq)).

Typing comes from `$Infer`:

```ts
export type Session = typeof auth.$Infer.Session          // server
export type Session = typeof authClient.$Infer.Session    // client
```

Plugins extend `$Infer.Session` (the `admin` plugin adds `user.role`/`banned`, `organization` adds
`session.activeOrganizationId`, …), and `additionalFields` flow into the user/session types
([TypeScript concepts](https://better-auth.com/docs/concepts/typescript)).

### 6.3 Next.js

- Route: `app/api/auth/[...all]/route.ts` with `toNextJsHandler(auth)`
  ([Next integration](https://better-auth.com/docs/integrations/next#create-api-route)).
- `nextCookies()` must be the **last** plugin; it replays `Set-Cookie` into `next/headers`
  `cookies().set()` for Server Actions (`node_modules/better-auth/dist/integrations/next-js.mjs:33-100`).
  1.7.18 warns at runtime if a later plugin declares `hooks.after`
  (`node_modules/better-auth/dist/integrations/cookie-plugin-guard.mjs:8-20`).
- **New in this line:** on `/get-session`, if the request is an RSC render (`RSC: 1` without
  `next-action`), it sets `shouldSkipSessionRefresh` — because `cookies().set()` in an RSC triggers
  Next's router-cache invalidation even when nothing changed
  (`node_modules/better-auth/dist/integrations/next-js.mjs:66-69`).
- Next 16 renamed middleware to **proxy**: the docs page now shows `proxy.ts` exporting `proxy`, and
  recommends a cookie-presence check (`getSessionCookie` from `better-auth/cookies`) over a DB call in
  the proxy, with the real check in each page/route
  ([Next integration](https://better-auth.com/docs/integrations/next#nextjs-16-proxy)).

### 6.4 Expo

`expo()` on the server, `expoClient({ scheme, storage: SecureStore })` on the client, the app scheme
added to `trustedOrigins`, and `expo-secure-store` installed
([Expo integration](https://better-auth.com/docs/integrations/expo)). In 1.7 secure-storage access
became asynchronous: `authClient.getCookie()` returns a promise
([upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#secure-storage-access-is-asynchronous)).

---

## 7. Extensibility

| Mechanism | Runs when | Can it change the response? | Note |
|---|---|---|---|
| `hooks.before` / `hooks.after` (root `hooks`) | every endpoint matching `matcher`, including direct `auth.api` calls | yes — return `ctx.json(...)` from `after` | [hooks](https://better-auth.com/docs/concepts/hooks) |
| Plugin `hooks` | same, scoped to the plugin | yes | [plugins](https://better-auth.com/docs/concepts/plugins#hooks) |
| Plugin `middlewares` | **only** on HTTP requests (not `auth.api`) | yes — throw `APIError` or return a `Response` | [plugins](https://better-auth.com/docs/concepts/plugins#middleware) |
| `onRequest` / `onResponse` | every request/response in the instance | `onRequest` can short-circuit | [plugins](https://better-auth.com/docs/concepts/plugins#on-request--on-response) |
| `databaseHooks` | per model; `create` / `update` / `delete`, each with `before` and `after` | `before` can rewrite `data` and `throw` | [database concepts](https://better-auth.com/docs/concepts/database#database-hooks) |
| Custom endpoints | `createAuthEndpoint("/path", {method, body, query}, handler)` | — | typed on the client via `$InferServerPlugin` |

`ctx` gives `path`, `body`, `headers`, `query`, `request`, `context` (`options`, `db`, `secret`,
`password`, `newSession`, `returned`, `setCookie`, `redirect`, `json`)
([hooks — ctx](https://better-auth.com/docs/concepts/hooks#ctx)). Errors are `APIError` with a status
and optional `code`; plugins can register error codes with `defineErrorCodes`
(`node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs:9`).

Client plugins add `getActions`, `getAtoms`, `pathMethods`, `fetchPlugins` and `atomListeners`
([plugins — client](https://better-auth.com/docs/concepts/plugins#creating-a-client-plugin)).

---

## 8. Operations

| Area | Facts |
|---|---|
| Environment variables | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` ([installation](https://better-auth.com/docs/installation)); `BETTER_AUTH_SECRETS` ([options](https://better-auth.com/docs/reference/options#secrets)); `BETTER_AUTH_TELEMETRY`, `BETTER_AUTH_TELEMETRY_DEBUG`, `BETTER_AUTH_TELEMETRY_ENDPOINT` (`node_modules/@better-auth/telemetry/dist/index.mjs:348-363`); `NEXT_PUBLIC_BETTER_AUTH_URL` participates in base-URL resolution ([security reference](https://better-auth.com/docs/reference/security#trusted-proxy-headers)) |
| CLI | `auth` package; generate / migrate / check / create-admin / init / upgrade / info / secret; Node ≥ 22.12 ([CLI](https://better-auth.com/docs/concepts/cli)) |
| Release model | Changesets; `main` = stable track (fixes, additive, no-action behaviour changes), `next` = beta track for features and breaking changes; PRs touching `packages/**` need a changeset ([CONTRIBUTING.md](https://github.com/better-auth/better-auth/blob/main/CONTRIBUTING.md)) |
| Versioning in practice | synchronized `1.7.x` train across `better-auth` + `@better-auth/*`, with documented exceptions (`@better-auth/utils`, `@better-auth/agent-auth` at 0.6.2); npm dist-tags at retrieval: `latest 1.7.22`, `beta 1.8.0-beta.9`, `release-1.6 1.6.34`, `rc 1.7.0-rc.6`, `canary` ([registry](https://registry.npmjs.org/better-auth)) |
| Licence | MIT (`package.json`; [README](https://github.com/better-auth/better-auth/blob/main/README.md)) |
| Self-hosting | Nothing external is required: your database, your secret, your SMTP. A hosted "Better Auth Infrastructure" (dashboard, audit logs, `sentinel` abuse detection, managed e-mail/SMS) exists as an optional product ([infrastructure docs](https://better-auth.com/docs/infrastructure/introduction)) |
| Observability | OpenTelemetry spans on by default (opt-out); anonymous telemetry off by default (opt-in) — §5.7 |
| Known limits stated in docs | RSC cannot set cookies (so cookie cache does not refresh there) ([Next](https://better-auth.com/docs/integrations/next#rsc-and-server-actions)); cookie cache delays revocation; Workers KV cannot back `secondaryStorage`; Workers cannot hold a connection pool; `name`/`image`/`email` cannot be removed from the user table ([FAQ](https://better-auth.com/docs/reference/faq)); dual-module hazard when two `better-auth`/`@better-auth/core` copies exist, with a documented `serverExternalPackages: ['better-auth']` workaround for Next ([FAQ](https://better-auth.com/docs/reference/faq)) |

---

## 9. Doc/version drift

### 9.1 Within 1.7.18 (docs vs installed source)

| Claim | Reality in 1.7.18 | Evidence |
|---|---|---|
| 39 entries in the `/docs/plugins` catalogue (plus 3 infrastructure plugins) | 22 exist in core; 17 are separate packages | §3.1–3.3 |
| — | `custom-session` and `oauth-popup` have no plugin page; only `oauth-popup` is undocumented | `node_modules/better-auth/dist/plugins/{custom-session,oauth-popup}/`; docs 404; `customSession` is covered under session management |
| Plugin rate-limit example uses `limit:` | the type and the limiter read `max:` | `plugin.d.mts:109-113`, `rate-limiter/index.mjs:254-259` |
| "Better Auth doesn't encrypt tokens by default" (users & accounts) | true as a default, but `account.encryptOAuthTokens` exists and is the supported switch | [options](https://better-auth.com/docs/reference/options#encryptoauthTokens) |
| Rate-limit rules described as `/sign-in/email` | code matches the whole `/sign-in*` family | `rate-limiter/index.mjs:305-311` |
| Secondary-storage rate limiting presented as opt-in | source auto-selects `"secondary-storage"` whenever `secondaryStorage` is configured — already true in 1.6.34 | `create-context.mjs:175` |
| CLI invoked as `npx auth@latest` | `@better-auth/cli` still exists but is deprecated on npm | [registry](https://registry.npmjs.org/@better-auth/cli) |

### 9.2 What changed between 1.6.26 and 1.7.18

Only the items that touch this repo or invalidate a statement in the older note. The full list is the
[1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide), which is itself a primary
source for every line below.

| Change | Effect | Source |
|---|---|---|
| `account.issuer` column added in 1.7.0–1.7.2, **removed as a requirement in 1.7.3** | "The account schema is unchanged from 1.6." No migration needed unless a DB ran 1.7.0–1.7.2 | upgrade guide §"Account identity keeps the provider key" |
| Generic OAuth rebuilt on the social-provider path | callback URL becomes `/api/auth/callback/:id`; `signIn.oauth2` → `signIn.social`; **PKCE defaults to on**; issuer validation automatic | upgrade guide §"Generic OAuth is rebuilt…" |
| Magic-link **and** e-mail-OTP sign-in clear unproven credentials natively | the 1.6.26 behaviour the older note traced on `/sign-in/email-otp` is now documented and widened | upgrade guide §"Magic-link and email-OTP sign-in can clear unproven credentials" |
| Captcha matches **full** paths, wildcards required | `/sign-in` no longer matches `/sign-in/email`; use `/sign-in/*` | upgrade guide §"Captcha matches full paths" |
| `getIp` renamed `getIP` | import change for anyone using the helper | upgrade guide §"`getIp` is renamed `getIP`" |
| Secondary storage must implement `increment` + `getAndDelete`; rate-limit storage must implement `consume` | custom storage implementations break | upgrade guide §"Custom adapters and storage" |
| Cookie-cache session is bound to the `session_token` cookie | cached session cannot be replayed with another token | upgrade guide §"Behavior changes worth noticing" |
| Token/introspection/userinfo responses send `Cache-Control: no-store` | proxies stop caching credential responses | same |
| `experimental.joins` → `advanced.database.joins` | config move | upgrade guide §"Database joins moved out of experimental" |
| Two-factor `enableTwoFactor` returns a discriminated response (`method`) | callers must branch on `method` | upgrade guide §"Two-factor `enableTwoFactor`…" |

Two things I checked specifically because the older note depends on them, and both are **unchanged**:
`emailVerification.beforeEmailVerification` still runs immediately before promotion, on both the link
route and the OTP routes (`node_modules/better-auth/dist/api/routes/email-verification.mjs:286`,
`node_modules/better-auth/dist/plugins/email-otp/routes.mjs:312,718`), and
`revokeUnprovenAccountAccess` still exists and is still called from the e-mail-OTP sign-in route
(`node_modules/better-auth/dist/db/revoke-unproven-account-access.mjs:33`,
`node_modules/better-auth/dist/plugins/email-otp/routes.mjs:419`).

The older note's headline defect is nevertheless **closed in this checkout, and not by the library**:
`lib/auth.ts` registers no `emailVerification` block at all, so the hook that deleted every
`credential` account at verification time is simply not wired. `lib/verification-email-frontiere.test.ts:49-58`
pins that absence and the continued presence of the native revocation, and it passes against 1.7.18
(`npx vitest run lib/verification-email-frontiere.test.ts` → 3/3, run 12 Nov 2026). That test reads
`node_modules/better-auth/dist/**` and matches exact source strings (`lire`, `corpsDeRoute`), so it is
both an upgrade tripwire and a source of upgrade friction: a patch bump that relocates a string can
fail it with no behavioural change. Run it before moving to 1.7.22.

### 9.3 The documentation is now versioned — use the right index

`https://better-auth.com/llms.txt` lists three entry points: `latest` (1.7), `1.8 (Beta)`, `1.6`.
The unversioned `/docs/...` URL currently serves 1.7, but a page fetched later can silently become
1.8 documentation; `https://better-auth.com/docs/beta/llms.txt` already exists and lists plugin pages
the 1.7 index does not. Two options that look new when read only against 1.7 and are not: `secrets` and
`advanced.ipAddress.trustedProxies` are both documented on the 1.6 pages as well, so neither is a
1.7 upgrade argument ([1.6 options](https://better-auth.com/docs/1.6/reference/options),
[1.6 rate limit](https://better-auth.com/docs/1.6/concepts/rate-limit)).

---

## 10. What this means for eguidar

> **Analysis, not documented fact.** Everything in this section is my reading of `lib/auth.ts` and
> `docs/adr/` against the sources above. It states no new library behaviour.

### 10.1 Already adopted (verified line by line)

| Configured in `lib/auth.ts` | Library surface it exercises |
|---|---|
| `baseURL`, `trustedOrigins`, `secret` (`:32-34`) | [options](https://better-auth.com/docs/reference/options), [security](https://better-auth.com/docs/reference/security#trusted-origins) |
| `prismaAdapter(prisma, { provider: "postgresql" })` (`:35`) | §4.2 |
| `advanced.ipAddress.{ipAddressHeaders, trustedProxies}` (`:36-43`) | §5.2 — **this closes the 1.6.26 finding**: with Cloudflare ranges trusted, a multi-hop `x-forwarded-for` is walked right-to-left instead of yielding no IP |
| `account.encryptOAuthTokens: true` (`:44-49`) | §5.5 |
| `hooks: hooksEchecsConnexion` (`:50`) | §7 — root before/after hooks |
| `session.{expiresIn, updateAge}` (`:51-54`) | §2.1 |
| `user.additionalFields.role` (`:55-63`) | §4.5 |
| `emailAndPassword.{requireEmailVerification, minPasswordLength, revokeSessionsOnPasswordReset, password.{hash,verify}}` (`:64-73`) | §2, §5.6 — the custom `verify` is also the only rehash seam |
| `socialProviders.google` / `.facebook` with `disableDefaultScope` + explicit scopes (`:74-91`) | §2.2 |
| `emailOTP({expiresIn, storeOTP: "hashed", sendVerificationOTP})` (`:93-101`) | §3.1 — deviates from the `"plain"` default deliberately |
| `haveIBeenPwned({paths: [3 routes]})` (`:105-107`) | §5.6 — narrower than the 7 default paths |
| Local Turnstile plugin (`:108-115`) | §5.6 — see 10.4 |
| `nextCookies()` last (`:116`) | §6.3 — matches the required ordering, and 1.7.18 now warns if it is not last |
| `export type Session = typeof auth.$Infer.Session` (`:120`) | §6.2 |

### 10.2 Documented, installed-adjacent, and unused

Each line is a capability with a concrete entry point and the one reason it could matter here.

| Capability | Package / plugin | Why it might matter in this codebase |
|---|---|---|
| Two-factor auth | `twoFactor()` (core) | The storefront already gates admin behind a server check; TOTP on the Compte administrateur is the cheapest real hardening, no new package |
| Secret rotation | `secrets` / `BETTER_AUTH_SECRETS` (core) | `lib/auth.ts:45-47` accepts "rotating the secret makes existing provider tokens unreadable". That trade-off is now optional |
| `customSession` | `customSession()` (core; documented under session management) | A supported place to shape the `/get-session` payload — the kind of single owner ADR-0053 asks for, instead of editing session output by hand |
| Multi-session | `multiSession()` (core) | Account switching without sign-out; only worth it if a Compte client ever needs two identities (e.g. client + admin) |
| JWT / bearer | `jwt()`, `bearer()` (core) | Needed only if a non-cookie consumer appears (mobile app, external service) |
| i18n of error messages | `@better-auth/i18n` | Every user-facing string in this app is French; the library's error codes are English today |
| Last login method | `lastLoginMethod()` (core) | Small UX win on the Connexion modal ("you signed in with Google last time") |
| OAuth proxy | `oauthProxy()` (core) | Preview deployments on Coolify currently need stable callback URLs |
| Passkeys | `@better-auth/passkey` | Passwordless sign-in for returning Clients; adds `@simplewebauthn/*` and a new credential table |
| API keys | `@better-auth/api-key` | Only relevant if the Administration ever exposes a machine API |
| Organization / teams | `organization()` (core) | Not a fit for a single-vendor boutique; a B2B wholesale channel would change that |
| Admin (roles, ban, impersonate) | `admin()` (core) | **Collides with `user.role`** — see 10.3 |
| SSO / SCIM | `@better-auth/sso`, `@better-auth/scim` | Enterprise customers only; SAML drags in `samlify` + XML parsers |
| OAuth/OIDC provider, MCP, CIMD | `@better-auth/oauth-provider`, `@better-auth/mcp`, `@better-auth/cimd` | Only if eguidar becomes an identity provider for other apps |
| Billing plugins | `@better-auth/stripe`, `@polar-sh/better-auth`, … | The shop already owns Commandes; subscriptions are a different product |
| Telemetry | opt-in | Off today; nothing to do |

### 10.3 Capabilities that would conflict with existing decisions

| ADR | What it settles | What would collide |
|---|---|---|
| [ADR-0001](../adr/0001-modal-auth.md) | Login/sign-up are modals driven by `?open=login\|signup&next=…`; no `/connexion` or `/inscription` pages | Any capability that needs its own page or redirect entry point — `oauthProvider` (login + consent pages), `organization` invitations, `sso` provider callbacks — lands outside the modal and outside the URL contract |
| [ADR-0002](../adr/0002-password-reset-flow.md) | Reset is the `emailOTP` exchange on `/mot-de-passe-oublie` | `magicLink()` would add a second, link-based recovery path with a different token lifecycle; it does not replace the OTP flow, it competes with it |
| [ADR-0015](../adr/0015-modal-controller-owns-connexion-url-seam.md) | The modal controller owns the `?open`/`?next` read/write seam | A plugin that appends its own callback query parameters (OAuth proxy, SSO, one-tap) creates a second URL authority unless it is routed through that controller |
| [ADR-0019](../adr/0019-facebook-email-trusted-social-providers.md) | Facebook's e-mail is treated as verified via `mapProfileToUser`; providers are Facebook + Google | The `admin()` plugin re-declares `user.role` (`node_modules/better-auth/dist/plugins/admin/schema.mjs:4-8`), which duplicates the `additionalFields.role` this config already owns and would change the shape of the Facebook/Google user on first admin-enabled migration. `disableImplicitLinking` or `allowDifferentEmails` would also silently change the linking predicate the ADR reasons about |
| [ADR-0043](../adr/0043-codes-haches-et-mots-de-passe-compromis.md) | `storeOTP: "hashed"`; compromised passwords refused on Inscription + reset only | The `haveIBeenPwned` **default** paths include `/change-password`, `/admin/create-user`, `/admin/set-user-password` (`…/haveibeenpwned/index.mjs:51-59`). Dropping the explicit `paths` would widen the check past what the ADR decided, and enabling `admin()` would make two of those routes reachable |
| [ADR-0046](../adr/0046-suppression-des-donnees-facebook.md) | A Facebook deletion request deletes the whole Compte client | The library's own `deleteUser` path (verification, `beforeDelete`/`afterDelete` callbacks) is a candidate replacement for hand-rolled deletion — but only if it also removes sessions and linked accounts in the same order this ADR promises |
| [ADR-0053](../adr/0053-les-flux-d-authentification-possedent-leur-etat.md) | Auth flows own their state; the modal composes without keeping any | Client plugins (`twoFactorClient`, `multiSessionClient`, `inferAdditionalFields`) store their own state in the client's atom store; adopting one puts a second owner next to the flow hooks unless it is treated as I/O only |

### 10.4 The Turnstile seam, re-checked against 1.7.18

`lib/test-de-securite.ts:12-21` states that the local plugin exists because the library's `captcha`
plugin "checks a single `expectedAction` for its whole endpoint list, whereas a token must be bound to
the specific protected send that requested it". That is **still true in 1.7.18**: `expectedAction` is
one `string` on the provider options
(`node_modules/better-auth/dist/plugins/captcha/types.d.mts:21,34`), and there is **no per-request
predicate to fall back on**: `validateRequest` exists only on `VercelBotIdOptions` (`:89`), and
`captcha/index.mjs:30-34` passes it only when `provider === "vercel-botid"`. `allowedHostnames` is not
new either — it is present in 1.6.26 — and what 1.7 actually changed is full-path/wildcard `endpoints`
matching. So the gap is neither closed nor narrower in the direction this repo needs: a Turnstile
deployment still gets one action string for the whole endpoint list and no hook to bind it per
request. **Verdict: keep the seam.**

---

## Unverified

Stated plainly, because none of these is load-bearing for the sections above.

- **The library's minimum Node.js version.** The docs state Node ≥ 22.12 for the **CLI**
  ([upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide)); I did not find an explicit
  runtime floor for the library on the pages read, and did not infer one from `engines` (the npm
  manifest for 1.7.18 declares none — I checked `registry.npmjs.org/better-auth/1.7.18`).
- **Whether `@better-auth/cli` still works.** npm marks the package deprecated and the docs use
  `npx auth@latest`; I did not execute either CLI, so I cannot say whether the deprecated entry point
  still generates correct 1.7 schemas.
- **Whether `rateLimit.storage: "database"` is wired into the Prisma schema generator.** The docs say
  to run `migrate` (Kysely only) or `generate`; I did not run `auth generate`, so the emitted Prisma
  model for the `rateLimit` table is unconfirmed from the generator's own output.
- **Prisma adapter `transaction` behaviour under the repo's config.** Default is `false`
  (`@better-auth/prisma-adapter/dist/index.d.mts:28`); whether the repo enables it is outside this
  note's scope and I did not read `lib/db.ts` for it.
- **The exact HTTP surface of a failed HIBP call.** The code throws
  `INTERNAL_SERVER_ERROR` (`…/haveibeenpwned/index.mjs:34-37`), but I did not exercise it, so the
  rendered error (JSON vs error page) is not established here.
- **Whether OpenTelemetry spans are actually emitted in this app.** Instrumentation is opt-out in the
  library and `@opentelemetry/api` is present in `node_modules`, but no `TracerProvider` was observed
  to be configured; span *creation* is therefore likely, span *export* is not established.
- **The contents of `docs/adr/` beyond what I quoted.** I read the titles, the opening paragraphs and,
  for ADR-0019 and ADR-0043, the first decision bullets. The amendments after those paragraphs were not
  read in full, so §10.3's conflict analysis is against the decisions as stated there, not against
  every amendment.
- **Anything runtime.** No server was started, no migration applied, no route called, and no library
  behaviour was exercised; every behavioural statement above is a source read, not an observation. The
  one exception is the repo's own boundary test reported in
  [§9.2](#92-what-changed-between-1626-and-1718), which the lead ran after this note was drafted — it
  exercises `lib/verification-email-frontiere.test.ts`, not Better Auth's runtime.

---

## Sources

Primary sources, all retrieved **12 November 2026**.

**Documentation (versioned to the 1.7 line)**

1. Documentation index, 1.7 line — <https://better-auth.com/docs/llms.txt>
2. Documentation index, entry point and version selector — <https://better-auth.com/llms.txt>
3. Documentation index, 1.8 beta — <https://better-auth.com/docs/beta/llms.txt>
4. Introduction — <https://better-auth.com/docs/introduction>
5. Installation — <https://better-auth.com/docs/installation>
6. Basic usage — <https://better-auth.com/docs/basic-usage>
7. API concepts — <https://better-auth.com/docs/concepts/api>
8. CLI — <https://better-auth.com/docs/concepts/cli>
9. Client — <https://better-auth.com/docs/concepts/client>
10. Cookies — <https://better-auth.com/docs/concepts/cookies>
11. Database — <https://better-auth.com/docs/concepts/database>
12. Email — <https://better-auth.com/docs/concepts/email>
13. Hooks — <https://better-auth.com/docs/concepts/hooks>
14. Plugins — <https://better-auth.com/docs/concepts/plugins>
15. OAuth — <https://better-auth.com/docs/concepts/oauth>
16. Rate limit — <https://better-auth.com/docs/concepts/rate-limit>
17. Session management — <https://better-auth.com/docs/concepts/session-management>
18. TypeScript — <https://better-auth.com/docs/concepts/typescript>
19. Users & accounts — <https://better-auth.com/docs/concepts/users-accounts>
20. Email & password — <https://better-auth.com/docs/authentication/email-password>
21. Provider pages — <https://better-auth.com/docs/authentication/google>, <https://better-auth.com/docs/authentication/facebook>
22. Next.js integration — <https://better-auth.com/docs/integrations/next>
23. Expo integration — <https://better-auth.com/docs/integrations/expo>
24. Options reference — <https://better-auth.com/docs/reference/options>
25. Security reference — <https://better-auth.com/docs/reference/security>
26. Telemetry — <https://better-auth.com/docs/reference/telemetry>
27. Instrumentation — <https://better-auth.com/docs/reference/instrumentation>
28. FAQ — <https://better-auth.com/docs/reference/faq>
29. Prisma adapter — <https://better-auth.com/docs/adapters/prisma>
30. Upgrading to 1.7 — <https://better-auth.com/docs/guides/1-7-upgrade-guide>
31. Cloudflare guide — <https://better-auth.com/docs/guides/cloudflare>
32. Plugin pages (1.7) — `https://better-auth.com/docs/plugins/{2fa,username,anonymous,phone-number,magic-link,email-otp,passkey,generic-oauth,one-tap,siwe,admin,agent-auth,api-key,organization,oauth-provider,mcp,cimd,sso,scim,bearer,captcha,have-i-been-pwned,i18n,last-login-method,multi-session,oauth-proxy,one-time-token,open-api,jwt,test-utils,stripe,polar,autumn,dodopayments,creem,chargebee,commet,dub,device-authorization}`
33. 1.6 options reference, used only to date `secrets` and `trustedProxies` — <https://better-auth.com/docs/1.6/reference/options>

**GitHub**

34. Repository README — <https://github.com/better-auth/better-auth/blob/main/README.md>
35. CONTRIBUTING.md (release tracks, changesets) — <https://github.com/better-auth/better-auth/blob/main/CONTRIBUTING.md>
36. Release v1.7.18 — <https://github.com/better-auth/better-auth/releases/tag/v1.7.18>
37. Releases feed (1.7.x and 1.8.0-beta.x cadence) — <https://api.github.com/repos/better-auth/better-auth/releases>

**npm registry**

38. `better-auth` (dist-tags, 1.7.18 manifest, peer deps, exports map) — <https://registry.npmjs.org/better-auth>
39. `auth` (CLI) — <https://registry.npmjs.org/auth>
40. `@better-auth/cli` (deprecation) — <https://registry.npmjs.org/@better-auth/cli>
41. `@better-auth/passkey/1.7.18` (peer range) — <https://registry.npmjs.org/@better-auth/passkey/1.7.18>
42. `@better-auth/{api-key,sso}@1.7.18` — <https://registry.npmjs.org/@better-auth/api-key/1.7.18>, <https://registry.npmjs.org/@better-auth/sso/1.7.18>
43. `@better-auth/agent-auth` — <https://registry.npmjs.org/@better-auth/agent-auth>
44. Third-party billing plugins — <https://registry.npmjs.org/@polar-sh/better-auth>, <https://registry.npmjs.org/autumn-js>, <https://registry.npmjs.org/@dodopayments/better-auth>, <https://registry.npmjs.org/@creem_io/better-auth>, <https://registry.npmjs.org/@chargebee/better-auth>, <https://registry.npmjs.org/@commet/better-auth>, <https://registry.npmjs.org/@dub/better-auth>

**Installed source (`better-auth@1.7.18`, verified on disk)**

45. `node_modules/better-auth/package.json` — version, licence, exports map
46. `node_modules/better-auth/dist/context/create-context.mjs:147-187` — session defaults, rate-limit defaults, password limits
47. `node_modules/better-auth/dist/cookies/index.mjs:20-72` — cookie prefix, attributes, `session_data`
48. `node_modules/better-auth/dist/api/rate-limiter/index.mjs:245,287-321` — no-IP warning, atomic `consume`, special rules
49. `node_modules/@better-auth/core/dist/utils/ip.mjs:174-221` — `getIPFromHeader`, trusted-proxy walk, single-value rule
50. `node_modules/better-auth/dist/integrations/next-js.mjs:7-100` — `toNextJsHandler`, `nextCookies`, RSC skip
51. `node_modules/better-auth/dist/integrations/cookie-plugin-guard.mjs:14-15` — last-plugin warning
52. `node_modules/better-auth/dist/plugins/email-otp/{index.mjs:11-17,routes.mjs:312,419,718,755}` — OTP defaults, `beforeEmailVerification`, revocation, attempts
53. `node_modules/better-auth/dist/plugins/haveibeenpwned/index.mjs:9-60` — k-anonymity, default paths, fail-closed
54. `node_modules/better-auth/dist/plugins/captcha/types.d.mts:13-40,89` — providers, `expectedAction`, `allowedHostnames`, `validateRequest` (Vercel BotID only); `captcha/index.mjs:30-34` — BotID dispatch
55. `node_modules/better-auth/dist/plugins/admin/schema.mjs:4-30` — `user.role` + ban fields, `session.impersonatedBy`
56. `node_modules/better-auth/dist/plugins/{custom-session,oauth-popup,access,additional-fields}/` — modules absent from the plugin catalogue (only `oauth-popup` is undocumented)
57. `node_modules/@better-auth/prisma-adapter/dist/index.d.mts:8-28` — provider union, `usePlural`, `transaction`
58. `node_modules/@better-auth/core/dist/types/plugin.d.mts:27-122` — plugin contract, `rateLimit` shape at `:109-113`
59. `node_modules/@better-auth/core/dist/types/context.d.mts:255-292` — rate-limit context, `checkSchema`
60. `node_modules/@better-auth/core/dist/social-providers/index.mjs:80` — the 36 provider exports
61. `node_modules/@better-auth/telemetry/dist/index.mjs:348-363` — telemetry defaults
62. `node_modules/@better-auth/core/dist/instrumentation/tracer.mjs:57` — instrumentation opt-out

**This repository (read, not modified)**

63. `lib/auth.ts:30-120` — the full auth configuration cited in §10
64. `lib/adresse-client.ts:11-40` — header order and trusted proxy list
65. `lib/test-de-securite.ts:12-21` — the stated reason for the local Turnstile seam
66. `docs/research/backend-auth-architecture.md` — the 1.6.26 note this one cross-links to
67. `docs/adr/0001,0002,0015,0019,0043,0046,0053` — decisions cited in §10.3
