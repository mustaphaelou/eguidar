#!/usr/bin/env bash

set -euo pipefail

VARIABLES_REQUISES=(
  IMAGE_RUNNER
  IMAGE_MIGRATE
  DATABASE_URL
  MEILI_URL
  MEILI_MASTER_KEY
  ADMIN_EMAIL
  ADMIN_PASSWORD
  BETTER_AUTH_SECRET
)

for variable in "${VARIABLES_REQUISES[@]}"; do
  if [[ -n "${!variable:-}" ]]; then
    continue
  fi
  printf 'ECHEC : preflight — variable requise absente : %s\n' "$variable" >&2
  exit 1
done

PROBE_PORT="${PROBE_PORT:-3100}"
PROBE_TIMEOUT="${PROBE_TIMEOUT:-90}"
BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:${PROBE_PORT}}"

if [[ ! "$PROBE_PORT" =~ ^[0-9]+$ ]] || ((PROBE_PORT < 1 || PROBE_PORT > 65535)); then
  printf 'ECHEC : preflight — PROBE_PORT doit être un port : %s\n' "$PROBE_PORT" >&2
  exit 1
fi

if [[ ! "$PROBE_TIMEOUT" =~ ^[0-9]+$ ]] || ((PROBE_TIMEOUT < 1)); then
  printf 'ECHEC : preflight — PROBE_TIMEOUT doit être un nombre de secondes : %s\n' "$PROBE_TIMEOUT" >&2
  exit 1
fi

ADMINISTRATEURS_ATTENDUS=1

CATEGORIES_ATTENDUES=(
  accessoires
  audio-hifi
  gaming
  ordinateurs-tablettes
  smartphones
  tv-home-cinema
)

CATEGORIES_ATTENDUES_TEXTE="$(printf '%s,' "${CATEGORIES_ATTENDUES[@]}")"
CATEGORIES_ATTENDUES_TEXTE="${CATEGORIES_ATTENDUES_TEXTE%,}"

JOURNAL=""
CONTENEUR="eguidar-sonde-artefact-${PROBE_PORT}"

etape() {
  printf '\n── %s\n' "$1"
}

echec() {
  local phase="$1" cause="$2" lignes=""
  printf '\nECHEC : %s — %s\n' "$phase" "${cause%%$'\n'*}" >&2
  if docker inspect "$CONTENEUR" >/dev/null 2>&1; then
    lignes="$(docker logs --tail 30 "$CONTENEUR" 2>&1 || true)"
  elif [[ -n "$JOURNAL" && -f "$JOURNAL" ]]; then
    lignes="$(tail -n 30 "$JOURNAL" 2>/dev/null || true)"
  fi
  if [[ -n "$lignes" ]]; then
    printf '\nDernières lignes du conteneur :\n%s\n' "$lignes" >&2
  fi
  exit 1
}

nettoyer() {
  local code=$?
  if docker inspect "$CONTENEUR" >/dev/null 2>&1; then
    docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  fi
  if [[ -n "$JOURNAL" && -f "$JOURNAL" ]]; then
    rm -f "$JOURNAL"
  fi
  exit "$code"
}

trap nettoyer EXIT INT TERM

journaliser() {
  local journal="$1"
  shift
  "$@" 2>&1 | tee "$journal"
  return "${PIPESTATUS[0]}"
}

verifier_service() {
  local nom="$1" url="$2" port_par_defaut="$3"
  local adresse hote port
  adresse="${url#*://}"
  adresse="${adresse##*@}"
  adresse="${adresse%%/*}"
  hote="${adresse%%:*}"
  port="${adresse##*:}"
  if [[ "$port" == "$hote" ]]; then
    port="$port_par_defaut"
  fi
  if [[ -z "$hote" ]]; then
    echec "preflight" "URL illisible pour ${nom} : ${url}"
  fi
  if ! (exec 3<>"/dev/tcp/${hote}/${port}") 2>/dev/null; then
    echec "preflight" "${nom} injoignable sur ${hote}:${port}"
  fi
  printf '  %s joignable sur %s:%s\n' "$nom" "$hote" "$port"
}

executer_la_migration() {
  local code=0
  local arguments=(
    -e DATABASE_URL
    -e MEILI_URL
    -e MEILI_MASTER_KEY
    -e ADMIN_EMAIL
    -e ADMIN_PASSWORD
  )
  if [[ -n "${ADMIN_NAME:-}" ]]; then
    arguments+=(-e ADMIN_NAME)
  fi
  journaliser "$JOURNAL" docker run --rm --network host \
    "${arguments[@]}" "$IMAGE_MIGRATE" || code=$?
  if ((code != 0)); then
    echec "migration" "le conteneur de migration a rendu le code ${code}"
  fi
}

lire_les_faits_du_seed() {
  docker run --rm -i --network host \
    -e DATABASE_URL -e ADMIN_EMAIL \
    --entrypoint node "$IMAGE_MIGRATE" - 2>&1 <<'JS'
const { Client } = require("pg")

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  const administrateurs = await client.query(
    'SELECT count(*)::int AS nombre FROM "user" WHERE email = $1 AND role = $2',
    [process.env.ADMIN_EMAIL, "admin"]
  )
  const categories = await client.query(
    'SELECT slug FROM "Category" ORDER BY slug'
  )
  console.log(
    `administrateur=${administrateurs.rows[0].nombre} categories=${categories.rows
      .map((ligne) => ligne.slug)
      .join(",")}`
  )
  await client.end()
}

main().catch(async (erreur) => {
  console.error(`lecture des comptes impossible : ${erreur.message}`)
  await client.end().catch(() => {})
  process.exit(1)
})
JS
}

verifier_le_seed() {
  local code=0 faits=""
  faits="$(lire_les_faits_du_seed)" || code=$?
  if ((code != 0)); then
    echec "seed" "lecture des comptes impossible (code ${code}) : ${faits}"
  fi
  if [[ ! "$faits" =~ ^administrateur=([0-9]+)\ categories=(.*)$ ]]; then
    echec "seed" "faits illisibles : ${faits}"
  fi
  local administrateurs="${BASH_REMATCH[1]}" categories="${BASH_REMATCH[2]}"
  if ((administrateurs != ADMINISTRATEURS_ATTENDUS)); then
    echec "seed" "comptes administrateur : ${administrateurs} trouvé(s), ${ADMINISTRATEURS_ATTENDUS} attendu(s)"
  fi
  if [[ "$categories" != "$CATEGORIES_ATTENDUES_TEXTE" ]]; then
    echec "seed" "catégories : ${categories:-aucune} ; attendues : ${CATEGORIES_ATTENDUES_TEXTE}"
  fi
  printf '  administrateur : %s · catégories : %s\n' \
    "$administrateurs" "${categories//,/ · }"
}

verifier_le_cache_handler() {
  local code=0 sortie=""
  sortie="$(
    docker run --rm --entrypoint node "$IMAGE_RUNNER" \
      --input-type=module -e 'await import("/app/cache-handlers/redis-handler.js")' 2>&1
  )" || code=$?
  if ((code != 0)); then
    echec "cache-handler" "import impossible : ${sortie}"
  fi
  printf '  /app/cache-handlers/redis-handler.js s’importe dans l’image runner\n'
}

demarrer_le_serveur() {
  local code=0
  local arguments=(
    -e HOSTNAME=0.0.0.0
    -e PORT="$PROBE_PORT"
    -e DATABASE_URL
    -e MEILI_URL
    -e MEILI_MASTER_KEY
    -e BETTER_AUTH_SECRET
    -e BETTER_AUTH_URL="$BETTER_AUTH_URL"
  )
  if [[ -n "${REDIS_URL:-}" ]]; then
    arguments+=(-e REDIS_URL)
  fi
  docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  docker run -d --name "$CONTENEUR" --network host \
    "${arguments[@]}" "$IMAGE_RUNNER" >/dev/null || code=$?
  if ((code != 0)); then
    echec "boot" "le conteneur n’a pas démarré (code ${code})"
  fi
  printf '  conteneur %s démarré sur le port %s\n' "$CONTENEUR" "$PROBE_PORT"
}

attendre_l_accueil() {
  local debut=$SECONDS
  while ((SECONDS - debut < PROBE_TIMEOUT)); do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTENEUR" 2>/dev/null)" != "true" ]]; then
      echec "boot" "le conteneur s’est arrêté avant de servir"
    fi
    if node -e "fetch('http://localhost:${PROBE_PORT}/').then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
      printf '  accueil 200 après %s s\n' "$((SECONDS - debut))"
      return 0
    fi
    sleep 1
  done
  echec "boot" "pas de 200 sur / en ${PROBE_TIMEOUT} s"
}

verifier_la_surface() {
  local code=0 sortie=""
  sortie="$(
    PROBE_BASE="http://localhost:${PROBE_PORT}" node --input-type=module - <<'JS'
const base = process.env.PROBE_BASE

function echec(cause) {
  console.log(cause)
  process.exit(1)
}

const accueil = await fetch(`${base}/`, { redirect: "manual" })
if (accueil.status !== 200) echec(`accueil : ${accueil.status}, attendu 200`)

const actifs = [
  ...(await accueil.text()).matchAll(/\/_next\/static\/[^"'\s\\]+\.(?:js|css)/g),
]
const actif = actifs.find(([chemin]) => {
  const nom = chemin.slice(chemin.lastIndexOf("/") + 1)
  const tige = nom.slice(0, nom.lastIndexOf("."))
  return /^[A-Za-z0-9_-]{8,}$/.test(tige)
})
if (!actif) echec("accueil : aucun actif /_next/static/ haché trouvé")

const fichier = await fetch(`${base}${actif[0]}`, { redirect: "manual" })
if (fichier.status !== 200) echec(`${actif[0]} : ${fichier.status}, attendu 200`)

const admin = await fetch(`${base}/admin`, { redirect: "manual" })
if (admin.status !== 307) echec(`/admin : ${admin.status}, attendu 307`)

console.log(`  accueil 200 · ${actif[0]} 200 · /admin 307`)
JS
  )" || code=$?
  if ((code != 0)); then
    echec "http" "${sortie}"
  fi
  printf '%s\n' "$sortie"
}

verifier_que_le_serveur_tient() {
  local journaux=""
  if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTENEUR" 2>/dev/null)" != "true" ]]; then
    echec "boot" "le conteneur ne tourne plus après la sonde"
  fi
  journaux="$(docker logs "$CONTENEUR" 2>&1 || true)"
  if [[ "$journaux" =~ (Cannot\ find\ module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND) ]]; then
    echec "boot" "les journaux portent un échec de résolution de module"
  fi
  printf '  conteneur toujours en marche, aucun échec de résolution de module\n'
}

printf 'Sonde de l’artefact de déploiement\n'
printf '  runner  : %s\n' "$IMAGE_RUNNER"
printf '  migrate : %s\n' "$IMAGE_MIGRATE"
printf '  port    : %s\n' "$PROBE_PORT"

etape "preflight"
if ! docker info >/dev/null 2>&1; then
  echec "preflight" "démon Docker injoignable"
fi
for image in "$IMAGE_RUNNER" "$IMAGE_MIGRATE"; do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echec "preflight" "image introuvable : ${image}"
  fi
  printf '  image %s présente\n' "$image"
done
verifier_service "Postgres" "$DATABASE_URL" 5432
verifier_service "Meilisearch" "$MEILI_URL" 7700
if [[ -n "${REDIS_URL:-}" ]]; then
  verifier_service "Redis" "$REDIS_URL" 6379
fi

JOURNAL="$(mktemp "${TMPDIR:-/tmp}/eguidar-sonde-XXXXXX")"

etape "migration (1/2)"
executer_la_migration
etape "seed (1/2)"
verifier_le_seed
etape "migration (2/2)"
executer_la_migration
etape "seed (2/2)"
verifier_le_seed
etape "cache-handler"
verifier_le_cache_handler
etape "boot"
demarrer_le_serveur
attendre_l_accueil
etape "surface HTTP"
verifier_la_surface
verifier_que_le_serveur_tient

printf '\nSonde au vert : l’artefact migre, sème, s’importe et sert.\n'
