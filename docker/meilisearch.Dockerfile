# syntax=docker/dockerfile:1

FROM getmeili/meilisearch:v1.57.0
# Le moteur garde sa version, donc `data.ms/VERSION` ne bouge pas et la porte
# d'ADR-0066 n'est pas franchie : seuls les paquets Alpine de base montent en
# correctif.
RUN apk upgrade --no-cache
