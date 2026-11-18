# Le Test de sécurité dit pourquoi il attend, et se laisse réessayer

## Contexte

Le Test de sécurité garde chaque Envoi protégé : sans jeton, rien ne part. Tant qu'aucun jeton
n'était arrivé, le formulaire ne disait pourtant rien. Le bouton restait inerte, sans phrase ni
recours, et le Client ne distinguait pas un défi en cours d'une page qui ne répond plus.

Le widget a ses propres pannes : le script peut ne pas charger, et le défi peut expirer. Le Client
n'avait alors qu'une sortie — recharger la page — ce que la règle de l'Envoi protégé cherche
précisément à lui éviter.

## Décision

- **L'attente se dit.** Tant que le Test de sécurité attend, la surface qui le porte nomme l'état :
  le défi à terminer, ou le défi expiré.
- **L'attente se réessaie.** La ligne offre `Réessayer`, qui repose le script quand il n'a pas chargé
  et remet le widget à zéro sinon. Réessayer ne dispense de rien : le jeton reste la seule clé de
  l'Envoi protégé.
- **Une ligne, deux copies.** Le défi en cours et le défi expiré partagent la même ligne et le même
  bouton ; seule la phrase change.

## Options envisagées

- **Laisser l'attente muette.** Rejetée : c'est la panne d'origine, et elle se lit comme un formulaire
  cassé.
- **Nommer l'erreur technique.** Rejetée : le Client n'a pas à savoir si le script a échoué ou si le
  défi a expiré, seulement ce qu'il peut faire.
- **Renvoyer le Client vers un rechargement de page.** Rejetée : la règle de l'Envoi protégé dit
  qu'un jeton refusé ne le piège pas sur une page à recharger ; une attente sans jeton ne doit pas le
  piéger davantage.

## Coût

- Une ligne de copie et un bouton de plus sur chaque surface qui affiche le Test de sécurité :
  l'Inscription, la Connexion par mot de passe, l'envoi du code et la page de réinitialisation.
- `Réessayer` peut être pressé sans fin. La boutique ne compte pas ces essais et le serveur reste le
  seul juge du jeton : un widget reposé ne rend pas plus de jetons, il rend un jeton au plus.
