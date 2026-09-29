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

/** Les étapes qui portent une commande, dans l'ordre du job. */
function commandesRun(job: Record<string, unknown>): string[] {
  // Le transtypage ne présuppose rien : les deux seuls appelants de cette
  // fonction sont passés par la garde d'`exigerDesJobsLus`, qui refuse tout
  // job dont `steps` n'est pas un tableau.
  return (job.steps as unknown[])
    .filter(estObjet)
    .map((etape) => etape.run)
    .filter((run): run is string => typeof run === "string")
}

/**
 * Les jobs que ce flux déclare, tels qu'il les déclare, dans l'ordre du fichier,
 * ou l'erreur qui dit lequel d'entre eux ne se laisse pas lire.
 *
 * Cette fonction ne lit aucun fichier : elle prend ce que `js-yaml` a rendu. La
 * lecture du disque et le jugement sur ce qu'elle dit sont deux questions
 * distinctes, et seule la seconde se décide ici — c'est ainsi qu'un test peut
 * donner à ce module un flux qu'aucun fichier du dépôt ne contient, et voir ce
 * qu'il en dit, sans écrire un fichier pour le faire.
 *
 * L'autre réponse, celle d'un chemin en paramètre de `lireLesJobs`, aurait eu
 * l'air plus simple, et se serait heurtée à deux objections. Elle aurait promis
 * un second flux que ce dépôt n'a pas : une couture qu'aucun appelant ne
 * traverse est une couture qui ne prouve rien, le reproche que ce dépôt fait à
 * toute interface qui n'a qu'un seul utilisateur. Et elle aurait laissé la
 * condition à tester derrière `js-yaml` et le système de fichiers, alors que la
 * forme en cause est précisément celle que le lecteur a déjà sous les yeux.
 *
 * Le `source` reste en revanche un paramètre, et sans valeur par défaut : un
 * test qui fabrique un flux ne doit pas voir son erreur accuser le vrai
 * `ci.yml`, alors que le message doive nommer le fichier que l'appelant a
 * réellement lu.
 */
export function exigerDesJobsLus(
  flux: unknown,
  source: string
): Map<string, Record<string, unknown>> {
  const jobs = estObjet(flux) ? flux.jobs : null
  if (!estObjet(jobs)) {
    throw new Error(`${source} : clé \`jobs\` absente ou illisible`)
  }

  const lus = new Map<string, Record<string, unknown>>()
  for (const [nom, job] of Object.entries(jobs)) {
    if (!estObjet(job) || !Array.isArray(job.steps)) {
      throw new Error(`${source} : le job \`${nom}\` n'a pas d'étapes`)
    }
    // Un tableau d'étapes n'est pas encore un job qui lance quelque chose : une
    // action de premier plan remplit `steps` sans jamais y écrire de commande,
    // et ce module ne lit qu'un `run`. La garde d'au-dessus reste donc muette sur
    // cette forme, et le job se glisse dans la liste sans y apporter de check —
    // c'est-à-dire un travail que la CI fait et que rien ne sait nommer. Ce que
    // la lecture ne voit pas doit se dire, sinon une liste vide signifie
    // « aucun job ne lance de check » aussi bien que « rien n'a été lu », et une
    // porte bâtie sur elle passe sans avoir rien vérifié.
    //
    // La limite est posée à la commande, et non au check : un job qui n'invoque
    // que `npm ci` passe cette garde, parce qu'il dit bel et bien ce qu'il fait.
    // Écarter les installations est déjà l'affaire d'`extraireLesChecks`, et
    // dire qu'un job sans check est un job inutile serait une autre question que
    // celle que cette lecture se pose.
    if (commandesRun(job).length === 0) {
      throw new Error(
        `${source} : le job \`${nom}\` n'a aucune étape qui porte une commande`
      )
    }
    lus.set(nom, job)
  }
  return lus
}

/**
 * Les jobs du flux de la CI, tels qu'il les déclare, dans l'ordre du fichier.
 *
 * Un flux que ce module ne sait pas lire lève au lieu de rendre un ensemble
 * vide : une liste vide ferait verdir ses deux appelants pour la mauvaise
 * raison, ce qui est précisément le mal que cette lecture cherche à empêcher.
 * Un job sans clé `steps` — un appel à un flux réutilisable — et un job dont
 * aucune étape ne porte de commande sont deux façons de dire la même chose, et
 * tous deux lèvent.
 */
export function lireLesJobs(): Map<string, Record<string, unknown>> {
  return exigerDesJobsLus(load(readFileSync(FLUX, "utf8")), FLUX)
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
