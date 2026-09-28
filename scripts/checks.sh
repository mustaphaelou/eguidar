#!/usr/bin/env bash
#
# Le point d'entrée des checks.
#
# Il lance, dans l'ordre où la CI les lance, tous les checks que
# `.github/workflows/ci.yml` invoque, et s'arrête au premier qui échoue en
# nommant celui-là.
#
# Pourquoi un script shell et non une entrée de `package.json` : le dépôt vit
# dans un environnement Linux et le shell de l'agent non. Une entrée de
# manifeste rouvre le problème de guillemets un cran plus haut ; un script
# shell, invoqué une seule fois, ne le traverse qu'une fois, à son propre nom.
#
# Pourquoi la liste des checks est lue et non écrite : une seconde liste
# maintenue à la main dérive, et une liste qui a dérivé est une porte qui
# vérifie autre chose que ce que la CI vérifie. La CI fait autorité sur ce
# qu'est un check — le manifeste, lui, déclare aussi `dev`, `start`,
# `test:watch`, `format` et `build:check`, qu'aucune vérification automatique
# ne doit jamais lancer. Le flux est donc relu ici, à chaque exécution.

set -euo pipefail

# La racine se déduit de l'emplacement du script, pas du dossier courant : le
# script reste alors juste depuis n'importe où, et la lecture du flux vise
# toujours le dépôt qui contient ce script, jamais un autre.
RACINE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FLUX="${RACINE}/.github/workflows/ci.yml"

# ---------------------------------------------------------------------------
# L'extracteur
#
# Il est écrit en JavaScript et appelé par `node` pour une seule raison : la
# lecture du flux doit être exacte. Le même `js-yaml`, déjà dépendance du dépôt,
# lit le même fichier que `scripts/ci.test.ts`, avec les mêmes règles — donc les
# deux endroits ne peuvent pas diverger sur ce qu'est un check. Une lecture par
# `grep` serait plus courte, mais approximative : elle casse sur le bloc plié
# (`options: >-`) du job `test`, et sur toute commande `npm` écrite d'une
# manière nouvelle. Une approximation, ici, produirait une liste fausse en
# silence — exactement la dérive que ce script existe pour empêcher.
# ---------------------------------------------------------------------------
LECTEUR=$(cat <<'LECTEUR_JS'
const { readFileSync } = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")

// Les deux chemins arrivent par l'environnement et non par `argv` : avec
// `node -e`, aucun chemin de script ne vient s'intercaler dans `process.argv`,
// et le décalage qui en découle est le genre de subtilité qui ne se remarque
// qu'après avoir vérifié à la main. L'environnement ne bouge pas.
const racine = process.env.EGUIDAR_RACINE
const cheminFlux = process.env.EGUIDAR_FLUX

// `js-yaml` est résolu depuis la racine du dépôt plutôt que depuis le dossier
// courant : c'est le module que le manifeste installe, et non celui que la
// machine aurait par hasard.
const charger = createRequire(path.join(racine, "package.json"))
const { load } = charger("js-yaml")

/**
 * Les commandes `npm` qui installent au lieu de vérifier. `npm ci` est dans
 * les cinq jobs : le confondre avec un check mettrait « ci » dans la liste et
 * ferait échouer le point d'entrée sur une installation — un check qui n'en est
 * pas un.
 */
const COMMANDES_NPM_DINSTALLATION = new Set(["ci", "install", "i"])

/**
 * `npm run <nom>`, et la forme implicite `npm <nom>` que le job `test` emploie :
 * `npm test` est un raccourci de `npm run test`, pas un script distinct. Les
 * deux formes se ramènent au même nom. `npx` ne passe pas ici : `npx prisma
 * generate` prépare, il ne vérifie rien.
 */
const FORME_NPM = /\bnpm\s+(?:run\s+)?([a-z][\w:.-]*)/g

function estObjet(valeur) {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

// Un flux illisible est une raison de s'arrêter, pas un flux sans check : une
// liste vide ferait verdir le point d'entrée pour la mauvaise raison. Les
// erreurs sont donc converties en un message, sans la pile d'appels — un
// appelant veut savoir ce qu'il doit corriger, pas relire Node.
try {
  const flux = load(readFileSync(cheminFlux, "utf8"))
  const jobs = estObjet(flux) ? flux.jobs : null
  if (!estObjet(jobs)) {
    throw new Error(`${cheminFlux} : clé \`jobs\` absente ou illisible`)
  }

  const vus = new Set()
  const checks = []

  // `Object.entries` rend les clés dans leur ordre d'insertion, et `js-yaml`
  // construit l'objet dans l'ordre du fichier : l'ordre des jobs, donc l'ordre
  // d'invocation de la CI, est l'ordre d'exécution ici. Aucun ordre n'est
  // inventé.
  for (const [nomJob, job] of Object.entries(jobs)) {
    const etapes = estObjet(job) ? job.steps : null
    if (!Array.isArray(etapes)) {
      throw new Error(`${cheminFlux} : le job \`${nomJob}\` n'a pas d'étapes`)
    }
    for (const etape of etapes) {
      if (!estObjet(etape) || typeof etape.run !== "string") continue
      for (const trouve of etape.run.matchAll(FORME_NPM)) {
        const nom = trouve[1]
        if (COMMANDES_NPM_DINSTALLATION.has(nom)) continue
        // Un check déjà lancé ne se relance pas : si deux jobs l'invoquent, une
        // seule exécution suffit à prédire le vert de la CI, et la liste
        // affichée reste la liste des jobs, pas celle des commandes.
        if (vus.has(nom)) continue
        vus.add(nom)
        checks.push(nom)
      }
    }
  }

  if (checks.length === 0) {
    // Même raison qu'au-dessus : un flux dont aucun check n'est reconnu doit
    // arrêter le point d'entrée, pas le laisser conclure « tout est au vert ».
    throw new Error(`${cheminFlux} : aucun check n'est invoqué`)
  }

  process.stdout.write(`${checks.join("\n")}\n`)
} catch (erreur) {
  process.stderr.write(`${erreur.message}\n`)
  process.exit(1)
}
LECTEUR_JS
)

if ! CHECKS_LUS="$(
  cd -- "$RACINE" &&
    EGUIDAR_RACINE="$RACINE" EGUIDAR_FLUX="$FLUX" node -e "$LECTEUR"
)"; then
  printf 'Le point d’entrée ne peut pas savoir ce qu’il doit lancer : rien n’a été lancé.\n' >&2
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
