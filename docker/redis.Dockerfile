# syntax=docker/dockerfile:1

FROM redis:7-alpine
# L'image amont fige ses paquets Alpine au jour de sa publication : `apk
# upgrade` y remplace `zlib` et `libssl3` par les versions corrigées du dépôt.
RUN apk upgrade --no-cache
