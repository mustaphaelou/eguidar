import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { load } from "js-yaml"

const RACINE = path.resolve(import.meta.dirname, "..")

/**
 * Le flux qui fait autorité sur ce qu'est un check. Tout ce qui veut savoir
 * quels checks la CI invoque — son test, le point d'entrée des checks — le lit
 * par ici, et nulle part ailleurs : une définition recopiée dans deux appelants
 * est une définition qui diverge en silence, et l'écart se voit d'abord par un
 * point d'entrée qui lance autre chose que la CI.
 *
 * Il est relu par `js-yaml` plutôt que cherché par `grep` : `grep` casse sur le
 * bloc plié (`options: >-`) du job `test` et sur toute commande `npm` écrite
 * d'une manière nouvelle, et une approximation, ici, produirait une liste
 * fausse en silence — exactement la dérive que ce module existe pour empêcher.
 */
export const FLUX = path.join(RACINE, ".github", "workflows", "ci.yml")

/**
 * Les commandes `npm` qui installent au lieu de vérifier. `npm ci` est dans les
 * cinq jobs : le confondre avec un check en mettrait « ci » dans la liste, et
 * le point d'entrée échouerait sur une installation — un check qui n'en est pas
 * un.
 */
const COMMANDES_NPM_DINSTALLATION = new Set(["ci", "install", "i"])

/**
 * `npm run <nom>`, et la forme implicite `npm <nom>` que le job `test` emploie :
 * `npm test` est un raccourci de `npm run test`, pas un script distinct. Les
 * deux formes se ramènent au même nom, et c'est ce nom que l'on compare au
 * manifeste. `npx` ne passe pas ici : `npx prisma generate` prépare, il ne
 * vérifie rien.
 */
const FORME_NPM = /\bnpm\s+(?:run\s+)?([a-z][\w:.-]*)/g

export function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

/** Les noms de check que ces commandes invoquent, sans doublon ni ordre. */
export function extraireLesChecks(commandes: readonly string[]): string[] {
  const nommes = commandes.flatMap((commande) =>
    [...commande.matchAll(FORME_NPM)].map((trouve) => trouve[1])
  )
  return [
    ...new Set(nommes.filter((nom) => !COMMANDES_NPM_DINSTALLATION.has(nom))),
  ]
}

/**
 * Les jobs du flux, tels qu'il les déclare, dans l'ordre du fichier.
 *
 * Un flux que ce module ne sait pas lire lève au lieu de rendre un ensemble
 * vide : une liste vide ferait verdir ses deux appelants pour la mauvaise
 * raison, ce qui est précisément le mal que cette lecture cherche à empêcher.
 */
export function lireLesJobs(): Map<string, Record<string, unknown>> {
  const flux = load(readFileSync(FLUX, "utf8"))
  const jobs = estObjet(flux) ? flux.jobs : null
  if (!estObjet(jobs)) {
    throw new Error(`${FLUX} : clé \`jobs\` absente ou illisible`)
  }

  const lus = new Map<string, Record<string, unknown>>()
  for (const [nom, job] of Object.entries(jobs)) {
    if (!estObjet(job) || !Array.isArray(job.steps)) {
      throw new Error(`${FLUX} : le job \`${nom}\` n'a pas d'étapes`)
    }
    lus.set(nom, job)
  }
  return lus
}

/** Les étapes qui portent une commande, dans l'ordre du job. */
function commandesRun(job: Record<string, unknown>): string[] {
  return (job.steps as unknown[])
    .filter(estObjet)
    .map((etape) => etape.run)
    .filter((run): run is string => typeof run === "string")
}

/** Les checks que chaque job exécute, dans l'ordre du flux. */
export function checksParJob(): Map<string, string[]> {
  return new Map(
    [...lireLesJobs()].map(([nom, job]) => [
      nom,
      extraireLesChecks(commandesRun(job)),
    ])
  )
}

/**
 * Tous les checks du flux, sans doublon, dans l'ordre d'invocation de la CI.
 *
 * `js-yaml` construit l'objet des jobs dans l'ordre du fichier, et
 * `Object.entries` le restitue dans cet ordre : l'ordre d'invocation est donc
 * l'ordre de sortie, aucun n'est inventé. Un check déjà lancé ne se relance
 * pas — si deux jobs l'invoquent, une seule exécution suffit à prédire le vert,
 * et la liste affichée reste la liste des jobs, pas celle des commandes.
 */
export function checksDuFlux(): string[] {
  const vus = new Set<string>()
  const checks: string[] = []
  for (const duJob of checksParJob().values()) {
    for (const nom of duJob) {
      if (vus.has(nom)) continue
      vus.add(nom)
      checks.push(nom)
    }
  }
  return checks
}

/**
 * Lancée en direct — c'est ainsi que le point d'entrée des checks s'en sert —
 * cette liste devient la sortie standard, un check par ligne. Importée par un
 * test, la liste se tait. Les erreurs sont converties en un message sans la
 * pile d'appels : un appelant veut savoir ce qu'il doit corriger, pas relire
 * Node.
 */
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(`${checksDuFlux().join("\n")}\n`)
  } catch (erreur) {
    process.stderr.write(`${(erreur as Error).message}\n`)
    process.exit(1)
  }
}
