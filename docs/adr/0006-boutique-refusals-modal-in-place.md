# Boutique refusals open the Connexion modal in place, never a navigation

Boutique server actions gated the session through `requireSessionUser`, whose `redirect()` bounced an anonymous shopper from e.g. `/produit/x` to `/?open=login&next=…` — leaving the page entirely, which contradicts ADR-0001's own rationale ("the user never loses their browsing context"). We decided that a boutique action refused for an unauthenticated Visiteur returns a typed "unauthenticated" result instead of redirecting; the caller opens the Connexion modal over the current page with the Destination post-connexion set to the current URL. The admin back-office keeps its server-side redirect gate because its UI must never render unauthenticated (ADR-0001).

Considered options: keeping `redirect()` for actions too (rejected — loses browsing context, the exact bug this records); gating only pages client-side and letting actions redirect (rejected — two different behaviors for one and the same refusal).
