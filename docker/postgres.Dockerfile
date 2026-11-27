# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS gosu
ARG GOSU_COMMIT=6456aaa0f3c854d199d0f037f068eb97515b7513
WORKDIR /gosu
RUN apk add --no-cache git \
 && git init -q \
 && git fetch -q --depth 1 https://github.com/tianon/gosu "$GOSU_COMMIT" \
 && git checkout -q FETCH_HEAD \
 && go get golang.org/x/sys@v0.44.0 \
 && go build -trimpath -ldflags="-s -w" -o /usr/local/bin/gosu .

FROM postgres:16-alpine
# `gosu`, livré par l'amont, est un binaire Go figé au jour de sa publication :
# sa stdlib porte les avis Go du moment. Le reconstruire — tag `1.19`, épinglé
# au commit — avec le Go courant efface ces avis, et `apk upgrade` prend les
# correctifs Alpine sortis depuis.
RUN apk upgrade --no-cache
COPY --from=gosu /usr/local/bin/gosu /usr/local/bin/gosu
