# The slug is the public identifier of the Ville de livraison

The checkout trigger displayed the DeliveryCity database id and `?ville=` carried that id end-to-end — the URL spoke the database's language at the moment of payment (#284). Although `DeliveryCity.name` is already unique, DeliveryCity gains an immutable, system-generated `slug` and the slug becomes the only identifier ever written to `?ville=`: public URLs must not churn when a display name is corrected, and must not carry accents or spaces. The id survives in URL resolution only as a permanent read-only alias (slug first, then id), so pre-existing links and in-flight login round-trips keep working; an unknown identifier leaves no selection, as today. The slug is translated to the id once, at the panier/checkout page seam — the Devis machinery, server actions, profile storage, and Administration CRUD keep speaking the id.

## Considered Options

- **Use the (already-unique) name as the URL identifier** — rejected: accents and spaces end up percent-encoded, and any display-name correction would churn the public URL contract.
- **Keep the cuid in the URL** — rejected: that is the defect; the address bar must speak the domain's language, not the database's.
- **Admin-entered slugs, like Category and Product** — rejected deliberately: those are editorial identifiers curated per page; the Ville de livraison's slug is infrastructure. It is generated once at creation (lowercase, ASCII-folded, hyphenated — « Kénitra » → `kenitra`), immutable, and hidden from the Administration form, so a rename never breaks a shared link. If a slug is truly wrong, delete and recreate the city.
- **Drop `?ville=` and carry the Sélection du Devis server-side** — rejected: it fights the URL-as-state pattern (the Liste des Commandes URL language precedent) and complicates the Connexion/Session inactive round-trip, which preserves the URL as-is.

## Consequences

- Old `?ville=<cuid>` links resolve forever but are never produced again — the alias is read-only and invisible.
- The checkout URL remains the arrival-state record: re-picking a city in the checkout form updates the form and the Récapitulatif, not the URL. `?ville` = la ville demandée à l'arrivée.
- The closed picker trigger displays the name (explicit label mapping — Base UI `SelectValue` does not read item children); dropdown options keep « name — fee ».

## Amendement — La résolution du langage d'URL gagne propriétaire (#347)

La traduction du slug vers l'identifiant ne court plus à la couture des
pages Panier/Checkout : celles-ci remettent le fait brut `?ville=` et la
Ville de livraison du profil à `chargerDevis`. Le module Devis résout
lui-même le langage d'URL — slug d'abord, puis alias d'identifiant —
contre les Villes déjà chargées par `listDeliveryCities()` (aucun appel
supplémentaire, aucune double vérification d'existence) et dérive au même
endroit le fait de présence du lien (`urlVilleFournie`). `resoudreVilleId`
est supprimé ; `resoudreVilleUrl` répond désormais ces deux faits d'un
seul appel.

Un lien inconnu reste explicite : la Sélection résout « aucune », sans
repli sur la Ville du profil. Tout le reste d'ADR-0017 tient :
l'identifiant interne circule partout ailleurs (actions serveur, profil,
Administration), l'alias d'identifiant reste en lecture seule, et seuls
les slugs sont émis dans les nouvelles URL.

## Amendement — Le langage d'URL gagne son propre module (#350)

`resoudreVilleUrl`, inchangée, quitte le module Devis pour
`lib/use-cases/ville-url.ts` — le module « Langage d'URL de la Ville » —
où elle vit désormais aux côtés de `villeVersParam`, son pendant en
écriture et unique émetteur du fragment `?ville=<slug>`. `chargerDevis`
l'y consomme pour résoudre le langage d'URL (slug d'abord, puis alias
d'identifiant en lecture seule) contre les Villes déjà chargées. La règle
d'ADR-0017 ne change pas : seule la propriété du module se déplace.
