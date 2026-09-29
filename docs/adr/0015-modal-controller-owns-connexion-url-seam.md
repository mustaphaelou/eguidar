# The modal controller owns the connexion URL seam

The Lien de connexion (`?open`/`?next`) used to be read and written from five small modules:
the provider/composition root (`auth-dialogs-context.tsx`), the router-backed URL-sync seam
(`use-auth-url-sync.ts`), the URL self-cleaning component (`auth-url-sanitizer.tsx`), the
one-shot destination snapshot hook (`useAuthDestination` in `auth-headings.ts`), and the
step-state pass-through hook (`use-auth-dialog-header.ts`). There were three read channels and
two write channels for the same URL, the invariant that makes the flow coherent
(ADR-0001: the URL params are the source of truth) was enforced in three independent places,
and the session-gating predicate existed in two copies that had already drifted once (a
regression test guarded it). Understanding or changing one user-visible behavior — what
happens when the Visiteur opens the modal — required bouncing across five files.

## Decision

- **The modal controller (`components/auth/auth-dialogs.tsx`) is the sole reader and writer of
  the Lien de connexion URL params.** One read channel, one write channel: the controller's
  router push on open and router replace on close/clean are the only URL writes in the modal
  area, and its single read is the only one. The one-read/one-write invariant holds by
  construction, not by convention.

- **The controller surface is five conceptual members, reached through three exported hooks
  plus the composition wiring** — everything a caller must know: `openLogin({ email?, next? })`
  (opens the Connexion modal; `next` defaults to the current page), `openSignUp({ email? })`
  (opens the Inscription modal, preserving an existing `?next`), and `close()` (strips both
  auth params and clears the prefill e-mail), all three exported through the `useAuthDialogs()`
  hook; the spec's `isOpen`, exported as `useAuthDialogOpen(dialog)` (false while the session
  is resolving or a session exists, true only for the requested dialog when the URL names it);
  and the spec's `destination`, the reactive Destination post-connexion read, exported as
  `useAuthDialogDestination()`. The `AuthDialogsProvider`/`AuthDialogs` composition wiring is
  part of the same surface: consumers mount it once and consume the five members through it.

- **The absorbed modules are deleted; their invariants are controller-internal.** The provider,
  the URL-sync seam, the sanitizer, the one-shot destination hook, and the step-state
  pass-through no longer exist. URL self-cleaning is an internal effect; the session-gating
  predicate ("is the modal visible") now exists in exactly one copy inside the controller —
  it can no longer drift between the open predicate and the URL cleaner. The e-mail prefill
  state, hash preservation, the idempotence navigation guard, and the open deferral are also
  internal and not part of the interface.

- **The URL seam itself is unchanged.** `?open`/`?next` semantics, the `lien-de-connexion`
  pure-function contract, the legacy `/connexion`/`/inscription` redirects, and all
  server-side producers of auth URLs are untouched. ADR-0001 stands: this ADR does not
  re-litigate why the URL is the source of truth — it records who is allowed to touch it.

- **Dead full-page-reload fallbacks were deleted** from the sign-in and sign-up flows — the
  last "leave the page" violators of ADR-0001 *inside the modal seam*. The controller's
  never-leave-the-page/one-write-channel invariant is scoped to the seam it owns: opening,
  closing, and self-cleaning `?open`/`?next` never leave the page and are the only URL writes
  in the modal area. One full-page navigation remains, deliberately outside that scope: the
  post-authentication redirect in `use-sign-in-flow.ts` (`window.location.href = next`). It
  happens after a session exists and after the Lien de connexion params are gone, so it
  navigates *to* the Destination post-connexion instead of touching the seam. A future
  standalone page, if ever built, must be built on the controller, not on a reload.

- **Future consumers go through the interface.** The Session inactive feature will consume
  `openLogin()` (idle detection, notice, Panier reattachment remain its own concern). The
  `lien-de-connexion` vocabulary shrink (privatizing single-caller helpers) is a separate
  planned ticket.

## Considered Options

- **Keep the split modules** — rejected: it is the state this ADR replaces, with three read
  channels, two write channels, and a twice-copied predicate that had already drifted once.
- **Give the read/write channels to the `lien-de-connexion` module** — rejected: that module
  is the pure URL contract (`loginUrl`, `signupUrl`, `parseAuthParams`) with direct pure tests;
  making it stateful would blur the contract with the router.
- **Revert to dedicated `/connexion` pages** — rejected outright by ADR-0001; never an option
  here.

## Trade-offs

- **One large controller file vs five small ones**: the controller is now a deep module —
  a five-member surface over most of the flow's complexity. The cost is that the file is
  the single point of understanding for the modal; mitigated by its invariants being
  locally enforced and its behavior fully covered at the interface seam.
- **Callers depend on one module**: every consumer of the modal flow imports the controller,
  so it is on the critical path of the next feature in the area. Accepted — that is the point;
  the Session inactive feature is its first planned customer.

## Invariants

- One read channel, one write channel: only the controller reads `?open`/`?next` in the modal
  area, and only its router push (open) and router replace (close/clean) write them.
- The session-gating predicate exists in exactly one copy, inside the controller.
- The controller never leaves the page within its seam: no full-page reloads, no redirects
  while opening, closing, or syncing `?open`/`?next`. (The post-authentication redirect to
  the Destination post-connexion in `use-sign-in-flow.ts` happens after a session exists and
  the seam's params are gone; it is outside the invariant's scope.)
- ADR-0001 is untouched: the URL params remain the source of truth; this ADR only narrows
  who may read and write them.

## Amendement — Le préremplissage d'e-mail est un sixième membre (#473)

La troisième puce de la décision range quatre choses sous « also internal
and not part of the interface ». Trois y sont toujours : la préservation
du hash, le garde de navigation idempotent et le report d'ouverture
restent dans le contrôleur, que rien n'exporte. La première n'y est plus.

**Le choix fait ici est de dire où le préremplissage vit, plutôt que de
le soustraire à la surface.** Le soustraire serait un changement de la
surface du contrôleur — une modification de code — et non une
rectification du record ; le record se rectifie.

Le préremplissage est donc le sixième membre d'une surface que le corps
fixe à cinq. Il entre par `openLogin({ email })` et `openSignUp({ email })`,
sort par `close()` qui l'efface, et circule sur la valeur de contexte :
`AuthDialogsContextValue.email` (`components/auth/auth-dialogs.tsx:26`),
dans la valeur mémoïsée exposée au fournisseur (`:137-140`). Un
consommateur le lit — `components/auth/auth-dialog.tsx:108` en tire
`seedEmail` pour amorcer l'étape du formulaire — et c'est le seul. La
phrase « The controller surface is five conceptual members » est donc
fausse de ce membre, et la surface en compte six : les cinq
(`openLogin`, `openSignUp`, `close`, `isOpen`, `destination`) plus
l'e-mail de préremplissage.

Ce n'est pas un état dont l'interface pourrait se passer. ADR-0001 décide
que « after email verification the login modal opens with the email
prefilled » ; l'effet se produit par
`auth-dialog.tsx:151` (`onVerified={(verifiedEmail) => openLogin({ email:
verifiedEmail })}`), et il est observé à la couture de l'interface par
`components/auth/auth-dialog.test.tsx:402-410`. Un état vraiment interne
n'aurait rien à observer, et ADR-0001 n'aurait pas à le décider. Le
panneau qui le lit est par ailleurs dans la même aire que le contrôleur,
et non un appelant : c'est l'intérieur de la modale qui se sème
lui-même, et non un module extérieur qui négocie un état.

Seule la mention « the e-mail prefill state … internal and not part of
the interface » est levée. Le reste de la décision tient :

- un canal de lecture, un canal d'écriture, et le contrôleur seul
  propriétaire de la couture ;
- le prédicat de session en une seule copie, dans le contrôleur ;
- le Lien de connexion inchangé — `?open`/`?next`, `loginUrl`/`signupUrl`/
  `parseAuthParams`, les redirections héritées, et tous les producteurs
  serveur d'URL d'authentification ;
- les modules absorbés supprimés, leurs invariants dans le contrôleur ;
- ADR-0001 intacte, et les quatre invariants énoncés ci-dessus tous
  vrais — le sixième membre ne touche ni la lecture ni l'écriture des
  paramètres.
