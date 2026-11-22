# Le Moteur de recherche épingle une version exacte, et chaque montée est un geste délibéré

`docker-compose.yml` épinglait `getmeili/meilisearch:v1.52`, un alias de mineure qui flotte sur les correctifs. Le 2026-10-01, une montée vers `latest` a mis la production en boucle de redémarrage (#506) ; la remise en état a échoué deux fois avant que la version d'origine ne revienne (#507, #508).

Le Moteur de recherche estampille `data.ms/VERSION` avec la version complète du binaire, correctif compris, et refuse de démarrer sur toute différence sans `MEILI_UPGRADE_DB=true` (`crates/meilisearch/src/lib.rs::check_version`) ; une descente de version est refusée. Le volume est donc verrouillé sur la version qui l'a écrit — et un alias de mineure ne peut pas être cette version : le prochain correctif suffisait à faire tomber la production sans qu'un diff ne soit relu. Les versions 1.53 à 1.57 ne déplacent en revanche aucun des réglages que l'ADR-0023 a épinglés : `matchingStrategy`, la tolérance aux fautes, `maxTotalHits`, `estimatedTotalHits`, `maxValuesPerFacet` et `sortFacetValuesBy` sont identiques, et les ajouts — `sampledCount`, les règles de recherche en ligne, MCP — sont expérimentaux ou optionnels et ne sont pas activés ici.

## Décision

- **L'image est épinglée à une version exacte**, `vX.Y.Z`, aux six endroits qui l'énoncent : `docker-compose.yml`, les deux postes de service de `.github/workflows/ci.yml`, les deux mentions de `README.md` et la ligne de `docs/ARCHITECTURE.md`. Un test échoue si ces six lignes divergent, si l'étiquette n'est pas une version exacte, ou si elle vaut `latest`.
- **Chaque montée est un geste délibéré.** La demande de fusion qui la porte épingle la version et passe `MEILI_UPGRADE_DB=true` pour le seul démarrage qui franchit la porte ; une demande de fusion de suivi retire le drapeau une fois que le volume lit la nouvelle version.
- **Une copie du volume précède la fusion.** Une descente de version ne se fait pas en changeant l'étiquette ; elle se fait en restaurant cette copie avec l'image précédente.
- **La CI et le développement local démarrent sur un volume vide**, donc ils exercent la création et jamais la porte : ils ne peuvent pas prouver une montée. La répétition de la montée se fait à la main, sur un volume écrit par l'image précédente.

## Conséquences

- Une montée, correctif de sécurité compris, demande une demande de fusion, une copie préalable et un déploiement surveillé. C'est le coût de la porte, payable à chaque montée et non une fois.
- L'épinglage exact diverge des autres images du compose (`postgres:16-alpine`, `redis:7-alpine`), qui flottent. La divergence est voulue, et le test la porte.
- Un volume restauré depuis une copie antérieure redémarre avec l'image antérieure ; l'image antérieure sur un volume plus récent est refusée.

## Option écartée

Épingler la mineure (`v1.57`) en laissant `MEILI_UPGRADE_DB=true` en permanence : les correctifs entreraient seuls, mais la garde disparaîtrait et une descente resterait impossible — on échangerait la porte contre le droit de se tromper sans le voir. La montée vers `latest` du 2026-10-01 est exactement ce que cette option aurait laissé passer.
