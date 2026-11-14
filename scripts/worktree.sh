#!/usr/bin/env bash

# Crée un checkout de travail dans .worktrees/, jamais dans le checkout
# principal. Le node_modules est copié en dur (cp -al), pas lié : un lien
# résoudrait les paquets dans un autre checkout et ferait échouer les gardes qui
# comparent des chemins vendus.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage : scripts/worktree.sh <branche> [base]
        scripts/worktree.sh --dry-run <branche> [base]
        scripts/worktree.sh --list
        scripts/worktree.sh --help

Crée un worktree dans ${EGUIDAR_WORKTREES:-<racine>/.worktrees} :
  - branche <branche> depuis <base> (défaut : origin/main) si elle n'existe pas ;
  - copie en dur node_modules (cp -al) et copie .env du checkout principal ;
  - donne au worktree sa propre base de test dans TEST_DATABASE_URL ;
  - affiche le chemin absolu du worktree sur la dernière ligne.

--dry-run  affiche le chemin et la base de test, sans rien créer.
--list     liste les worktrees enregistrés (git worktree list).
--help     affiche cette aide.
EOF
}

if [ "$#" -eq 0 ]; then
  usage >&2
  exit 1
fi

case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
esac

brouillon=""
if [ "$1" = "--dry-run" ]; then
  brouillon=1
  shift
  if [ "$#" -eq 0 ]; then
    printf '%s\n' '--dry-run demande une branche.' >&2
    usage >&2
    exit 1
  fi
fi

if [ "$#" -gt 2 ]; then
  printf 'Trop d’arguments : une branche, et une base facultative.\n' >&2
  usage >&2
  exit 1
fi

if ! racine="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  printf 'scripts/worktree.sh : %s n’est pas dans un dépôt git.\n' "$PWD" >&2
  exit 1
fi

if [ "$1" = "--list" ]; then
  if [ "$#" -ne 1 ]; then
    printf '--list ne prend aucun argument.\n' >&2
    exit 1
  fi
  git -C "$racine" worktree list
  exit 0
fi

case "$1" in
  -*)
    printf 'Option inconnue : %s\n' "$1" >&2
    usage >&2
    exit 1
    ;;
esac

branche="$1"
base="${2:-origin/main}"

if [ -z "$branche" ]; then
  printf 'La branche est vide : rien n’a été créé.\n' >&2
  exit 1
fi

racine_worktrees="${EGUIDAR_WORKTREES:-$racine/.worktrees}"

case "$racine_worktrees" in
  /*) ;;
  *) racine_worktrees="$racine/$racine_worktrees" ;;
esac

mkdir -p -- "$racine_worktrees"
racine_worktrees="$(cd -- "$racine_worktrees" && pwd -P)"

cible="$racine_worktrees/${branche//\//-}"
base_de_test="eguidar_test_$(printf '%s' "$branche" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C sed -E 's/[^a-z0-9]+/_/g')"
base_de_test="${base_de_test:0:63}"

if [ -n "$brouillon" ]; then
  printf 'worktree : %s\nbase de test : %s\n' "$cible" "$base_de_test"
  exit 0
fi

if [ -e "$cible" ] || [ -L "$cible" ]; then
  printf 'Le worktree « %s » existe déjà : ce script ne touche jamais un checkout existant.\n' \
    "$cible" >&2
  exit 1
fi

if git -C "$racine" show-ref --verify --quiet "refs/heads/$branche"; then
  git -C "$racine" worktree add "$cible" "$branche"
else
  git -C "$racine" worktree add -b "$branche" "$cible" "$base"
fi

if [ -d "$racine/node_modules" ] && [ ! -L "$racine/node_modules" ]; then
  if [ -e "$cible/node_modules" ] || [ -L "$cible/node_modules" ]; then
    printf 'node_modules déjà présent dans %s : copie ignorée.\n' "$cible" >&2
  elif ! cp -al "$racine/node_modules" "$cible/node_modules"; then
    printf 'Attention : copie en dur de node_modules impossible (autre système de fichiers ?) ; lancez npm ci dans %s.\n' \
      "$cible" >&2
  fi
fi

if [ -f "$racine/.env" ] && [ ! -e "$cible/.env" ]; then
  cp -- "$racine/.env" "$cible/.env"
  # Chaque worktree a sa base de test : le global setup de Vitest tronque les
  # tables, donc deux suites simultanées sur la même base se détruiraient.
  if grep -q '^TEST_DATABASE_URL=' "$cible/.env"; then
    sed -i -E "s#^(TEST_DATABASE_URL=[^ ]*/)[^/? ]+#\\1${base_de_test}#" "$cible/.env"
    printf 'Base de test : %s — à créer une fois avant le premier « npm test » (createdb %s).\n' \
      "$base_de_test" "$base_de_test" >&2
  else
    printf 'Attention : TEST_DATABASE_URL est absent de %s ; deux suites simultanées partageraient la même base.\n' \
      "$cible/.env" >&2
  fi
fi

printf '%s\n' "$cible"
