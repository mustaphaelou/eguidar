#!/usr/bin/env bash
#
# Le point d'entrée des checks.
#
# Il lance, dans l'ordre où la CI les lance, tous les checks que
# `.github/workflows/ci.yml` invoque, et s'arrête au premier qui échoue en
# nommant celui-là.
#
# Pourquoi la liste des checks est lue et non écrite : une seconde liste
# maintenue à la main dérive, et une liste qui a dérivé est une porte qui
# vérifie autre chose que ce que la CI vérifie. `scripts/ci-liste.ts` en est le
# seul propriétaire, et lui répond aussi à la seule question qui décide de tout
# — qu'est-ce qu'un check. La CI tranche ; le manifeste, lui, déclare aussi
# `dev`, `start`, `test:watch`, `format` et `build:check`, qu'aucune
# vérification automatique ne doit jamais lancer.
#
# Une réserve, franche : chaque check est lancé tel quel, dans l'environnement
# de ce shell. Le `build` de la CI, lui, l'est après `npx prisma generate` et
# avec trois variables d'environnement que ce script ne recopie pas — les
# recopier serait exactement la seconde liste maintenue à la main que ce script
# existe pour supprimer. Un build rouge ici peut donc l'être pour une raison que
# la CI ne rencontrera pas ; la porte de format, elle, se laisse prédire.

set -euo pipefail

# La racine se déduit de l'emplacement du script, pas du dossier courant : le
# script reste alors juste depuis n'importe où, et la lecture du flux vise
# toujours le dépôt qui contient ce script, jamais un autre.
RACINE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# `node --import tsx` : `tsx` est déjà la dépendance qui lance la porte de
# format, et le module qui lit le flux est du TypeScript. Aucune lecture de YAML
# ne reste donc dans ce script, qui ne fait qu'invoquer et rendre la liste.
if ! CHECKS_LUS="$(
  cd -- "$RACINE" && node --import tsx scripts/ci-liste.ts
)"; then
  printf 'Le point d’entrée ne peut pas savoir ce qu’il doit lancer : rien n’a été lancé.\n' >&2
  exit 1
fi

# Une liste vide ne se prend pas pour un flux sans check : ne rien avoir à
# lancer n'est pas avoir tout au vert, et le run s'arrête sur le doute.
if [ -z "$CHECKS_LUS" ]; then
  printf 'Le flux n’invoque aucun check : rien à lancer, rien n’a été lancé.\n' >&2
  exit 1
fi

# `printf '%s'` sans saut de ligne final : un here-string en ajouterait un, et
# `mapfile` en ferait un sixième check vide.
mapfile -t CHECKS < <(printf '%s' "$CHECKS_LUS")

TOTAL=${#CHECKS[@]}
printf 'Les %d checks que la CI invoque, dans l’ordre du flux : %s\n\n' \
  "$TOTAL" "${CHECKS[*]}"

for ((i = 0; i < TOTAL; i++)); do
  CHECK="${CHECKS[$i]}"
  printf '── [%d/%d] %s\n' "$((i + 1))" "$TOTAL" "$CHECK"
  # `npm run <nom>` pour tous, y compris `test` : la CI écrit `npm test`, ce qui
  # n'est qu'un raccourci vers le même script. Une forme par check serait une
  # seconde liste, déguisée en détail d'invocation.
  #
  # Le code de retour est pris par `|| CODE=$?` et non par un `$?` lu après un
  # `if` : un `if` sans `else` dont la condition est fausse rend toujours zéro,
  # si bien qu'un run en échec aurait dit « tout est au vert » et serait sorti
  # en zéro. Un `if` qui mange le seul code qui comptait, dans un script dont
  # tout l'intérêt est ce code.
  CODE=0
  (cd -- "$RACINE" && npm run "$CHECK") || CODE=$?
  if [ "$CODE" -eq 0 ]; then
    continue
  fi
  # Un seul nom, jamais cinq : celui-là est actionnable, les autres seraient
  # un rapport que personne ne lit. Les checks suivants ne sont pas lancés.
  printf '\nÉCHEC : le check « %s » a rendu le code %d. Les checks suivants n’ont pas été lancés.\n' \
    "$CHECK" "$CODE" >&2
  exit "$CODE"
done

printf '\nLes %d checks sont au vert.\n' "$TOTAL"
