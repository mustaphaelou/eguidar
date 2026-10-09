#!/usr/bin/env bash

set -euo pipefail

RACINE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! CHECKS_LUS="$(
  cd -- "$RACINE" && node --import tsx scripts/ci-liste.ts
)"; then
  printf 'Le point d’entrée ne peut pas savoir ce qu’il doit lancer : rien n’a été lancé.\n' >&2
  exit 1
fi

if [ -z "$CHECKS_LUS" ]; then
  printf 'Le flux n’invoque aucun check : rien à lancer, rien n’a été lancé.\n' >&2
  exit 1
fi

mapfile -t CHECKS < <(printf '%s' "$CHECKS_LUS")

TOTAL=${#CHECKS[@]}
printf 'Les %d checks que la CI invoque, dans l’ordre du flux : %s\n\n' \
  "$TOTAL" "${CHECKS[*]}"

for ((i = 0; i < TOTAL; i++)); do
  CHECK="${CHECKS[$i]}"
  printf '── [%d/%d] %s\n' "$((i + 1))" "$TOTAL" "$CHECK"
  CODE=0
  (cd -- "$RACINE" && npm run "$CHECK") || CODE=$?
  if [ "$CODE" -eq 0 ]; then
    continue
  fi
  printf '\nÉCHEC : le check « %s » a rendu le code %d. Les checks suivants n’ont pas été lancés.\n' \
    "$CHECK" "$CODE" >&2
  exit "$CODE"
done

printf '\nLes %d checks sont au vert.\n' "$TOTAL"
