# Modal-based login and sign-up (no dedicated auth pages)

Login and sign-up previously lived on dedicated pages (`/connexion`, `/inscription`), and every guarded storefront page (cart, profile, orders, checkout) server-redirected to `/connexion`. We decided to replace both pages with modals that open over the current page, driven by URL state (`?open=login|signup&next=...`): the old URLs now redirect to the home page with the modal open, guarded storefront pages gate client-side (placeholder + modal) instead of server-redirecting, and the admin back-office keeps a server-side gate redirecting to home + modal with `?next=/admin`. Social login returns to the plain origin page logged-in, and sign-up does not auto-login — after email verification the login modal opens with the email prefilled.

Why: the user never loses their browsing context ("never leave the page"), there are no redirect chains or back-button traps, and URL state gives refresh/back/share semantics for free. Auth flows already require JS (Turnstile, OTP), so a no-JS fallback page adds nothing. Admin stays server-gated because its UI must never render unauthenticated.

Considered options: keeping `/connexion` as a fallback page (rejected — no no-JS audience, two code paths to drift); driving the modal from pure client state (rejected — no deep links, refresh loses the modal); a separate admin login page (rejected — duplicate UI for no gain).

## Amendement — Le vocabulaire du glossaire (#473)

Un seul point du texte est rectifié, et il ne porte que sur des mots.
« Auth flows already require JS (Turnstile, OTP) » : le glossaire proscrit
« OTP », et « Turnstile » comme nom du concept. Ce sont la **Vérification
de l'e-mail** et le **Test de sécurité** — les deux noms que le code
porte déjà (`components/auth/verification-de-l-email.ts`,
`components/auth/test-de-securite.tsx`). L'argument, lui, ne bouge pas :
ces flux exigent bien du JavaScript.

Le reste tient : les deux pages `/connexion` et `/inscription` ont cédé la
place aux modales, les anciennes URL ouvrent la page d'accueil avec la
modale au-dessus (`proxy.ts:6-9`), les pages de vitrine protégées se
ferment côté client, l'Administration reste fermée côté serveur, et
l'Inscription n'ouvre pas de session — une fois l'adresse vérifiée, c'est
la modale de Connexion qui s'ouvre, avec l'e-mail prérempli
(`auth-dialog.tsx:151`). Ce dernier point est une décision de comportement,
pas un détail : ADR-0015 s'appuie dessus pour situer le préremplissage.
