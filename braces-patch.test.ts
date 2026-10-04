import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * GHSA-vfj7-8cjw-p6xm (CVE-2026-93687) : `braces` parcourt son arbre
 * d'accolades par récursion, une image de pile par niveau d'imbrication, sans
 * garde de profondeur. Un motif court — il passe sous le plafond de 10 000
 * caractères que `parse` contrôle — et très imbriqué épuise la pile ; le
 * `RangeError` que personne n'attrape tue le processus Node. Sur cette machine,
 * 4 000 accolades emboîtées — 8 001 caractères, un cinquième du plafond — suffisent
 * à faire tomber le chemin `braces()` lui-même ; l'avis donne 3 500 sur Node
 * 26.5.0, et le seuil suit la taille de la pile.
 *
 * Aucun correctif n'existe à écrire en version : `3.0.3` est la dernière
 * publication du registre et l'avis la déclare vulnérable jusqu'à elle
 * comprise. Les autres guards de correctif épinglent donc un plancher, et il
 * n'y a rien à épingler ici — un plancher plus bas que la seule version
 * publiée serait une garde rouge dès l'installation.
 *
 * Ce qui se corrige est le graphe, pas la version. Aucun paquet livré n'atteint
 * `braces` : les seules racines sont des outils de développement, le CLI
 * `shadcn` — qui était une dépendance de production — et le plugin de lint de
 * Next. L'ensemble exact n'est pas écrit ici : `portes()` le dérive du
 * lockfile, sous le nom de chaque paquet qui pourrait le faire travailler.
 *
 * Le jour où le registre publie un correctif, ce fichier prend la forme des
 * autres : un plancher, `satisfiesPatchFloor`, et un override.
 */

const RACINE = process.cwd()

/** Le paquet que l'avis nomme ; les gardes le cherchent par ce nom dans l'arbre. */
const PAQUET = "braces"

type Entree = {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

type Arbre = Record<string, Entree>

type Manifeste = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/**
 * L'arbre installé, lu dans `package-lock.json` et non sur le disque : c'est
 * le lockfile que `npm ci` installe en CI et dans l'image Docker, et une
 * version présente dans `node_modules` peut venir d'une installation que
 * personne ne reproduira.
 */
function arbre(): Arbre {
  const lock = JSON.parse(
    readFileSync(path.join(RACINE, "package-lock.json"), "utf8")
  ) as { packages?: Arbre }
  return lock.packages ?? {}
}

/** Le manifeste lui-même : c'est lui qui dit ce qui est livré et ce qui ne l'est pas. */
function manifeste(): Manifeste {
  return JSON.parse(
    readFileSync(path.join(RACINE, "package.json"), "utf8")
  ) as Manifeste
}

/**
 * Les répertoires où Node cherche un paquet, du plus proche au plus éloigné :
 * ceux du paquet lui-même, puis ceux de chacun de ses `node_modules` parents,
 * puis la racine. L'ordre est celui de la résolution — un paquet imbriqué sous
 * `shadcn` voit d'abord ses propres dépendances, et les racines après.
 */
function reperes(depuis: string): string[] {
  const prefixes: string[] = []
  let segment = depuis
  while (segment !== "") {
    prefixes.push(`${segment}/`)
    const index = segment.lastIndexOf("/node_modules/")
    segment = index === -1 ? "" : segment.slice(0, index)
  }
  prefixes.push("")
  return prefixes
}

function resoudre(dans: Arbre, depuis: string, nom: string): string | null {
  for (const prefix of reperes(depuis)) {
    const candidat = `${prefix}node_modules/${nom}`
    if (dans[candidat] !== undefined) return candidat
  }
  return null
}

/**
 * Les noms qu'une entrée réclame à Node : ses dépendances, ses dépendances
 * optionnelles, et ses `peerDependencies` — que npm 7 installe, donc qui sont
 * dans l'arbre et qu'une traversée qui les écarterait laisserait invisible le
 * seul chemin par lequel une dépendance de production peut n'en être qu'une en
 * apparence. Seules les paires optionnelles sortent, et le lockfile les dit
 * ainsi.
 */
function demandes(entree: Entree): string[] {
  const optionnelles = new Set(Object.keys(entree.optionalDependencies ?? {}))
  const exigees = new Set(Object.keys(entree.dependencies ?? {}))
  const paires = Object.keys(entree.peerDependencies ?? {}).filter(
    (nom) => entree.peerDependenciesMeta?.[nom]?.optional !== true
  )
  return [...new Set([...exigees, ...optionnelles, ...paires])]
}

/**
 * Les entrées voisines de `chemin` dans l'arbre : ce que Node y résoudrait
 * comme dépendances, dans l'ordre de résolution. Les trois gardes du fichier —
 * fermeture de production, portes vers le paquet, copie présente — arpentent
 * toutes ces arêtes ; chacune n'a qu'un sens différent à prendre.
 */
function voisins(dans: Arbre, chemin: string): string[] {
  const suite: string[] = []
  for (const nom of demandes(dans[chemin] ?? {})) {
    const suivant = resoudre(dans, chemin, nom)
    if (suivant !== null) suite.push(suivant)
  }
  return suite
}

/**
 * Les entrées de l'arbre qu'atteignent les dépendances nommées — la fermeture
 * transitive, résolue comme Node la résout. Un nom du manifeste que le lockfile
 * ne contient pas est une erreur de lecture, pas une absence : le dire vaut
 * mieux qu'un jeu de résultats incomplet, qui ferait passer une garde pour
 * verte.
 */
function atteignables(dans: Arbre, racines: string[]): Set<string> {
  const vus = new Set<string>()
  const file: string[] = []
  for (const nom of racines) {
    const chemin = resoudre(dans, "", nom)
    if (chemin === null) {
      throw new Error(
        `${nom} est au manifeste et absent du lockfile : l'arbre lu n'est pas installable`
      )
    }
    file.push(chemin)
  }
  while (file.length > 0) {
    const chemin = file.pop()
    if (chemin === undefined || vus.has(chemin)) continue
    vus.add(chemin)
    file.push(...voisins(dans, chemin))
  }
  return vus
}

/** Les copies installées du paquet, avec la clé de lockfile qui les nomme. */
function copies(dans: Arbre, paquet: string): string[] {
  return Object.keys(dans).filter((cle) =>
    new RegExp(String.raw`(^|/)node_modules/${paquet}$`).test(cle)
  )
}

/**
 * Les paquets dont la fermeture atteint le paquet — les portes que le code
 * pourrait pousser pour le faire travailler. La relation est lue à l'envers
 * depuis la copie : chaque entrée réclame ses dépendances résolues, et l'on
 * remonte de la copie vers qui y mène, une entrée visitée une seule fois.
 *
 * Les noms, pas les clés de lockfile : deux copies imbriquées du même paquet
 * sont la même porte. La racine du lockfile n'en est pas une — c'est le
 * manifeste, que les autres gardes interrogent déjà.
 */
function portes(dans: Arbre, paquet: string): Set<string> {
  const copiesDuPaquet = copies(dans, paquet)
  if (copiesDuPaquet.length === 0) return new Set()
  const appelants = new Map<string, Set<string>>()
  for (const cle of Object.keys(dans)) {
    for (const cible of voisins(dans, cle)) {
      const deja = appelants.get(cible) ?? new Set<string>()
      deja.add(cle)
      appelants.set(cible, deja)
    }
  }
  const noms = new Set<string>()
  const file = [...copiesDuPaquet]
  while (file.length > 0) {
    const chemin = file.pop()
    if (chemin === undefined || chemin === "") continue
    const nom = chemin.replace(/^.*node_modules\//, "")
    if (noms.has(nom)) continue
    noms.add(nom)
    for (const appelant of appelants.get(chemin) ?? []) file.push(appelant)
  }
  return noms
}

/**
 * Les fichiers que l'index suit et qui peuvent charger un module : le
 * périmètre que la garde relit. Le JavaScript compte autant que le TypeScript
 * — `eslint.config.mjs` est le fichier où un plugin de lint tirerait un
 * expanseur d'accolades bien avant que le TypeScript ne le fasse.
 */
function fichiersSources(): string[] {
  const extensions = [".ts", ".tsx", ".js", ".mjs", ".cjs"]
  const lecture = spawnSync("git", ["ls-files", "-z"], {
    cwd: RACINE,
    encoding: "utf8",
  })
  if (lecture.error !== undefined || lecture.status !== 0) {
    throw new Error(
      `lecture de l'index impossible : ${lecture.error?.message ?? String(lecture.status)}`
    )
  }
  return (lecture.stdout ?? "")
    .split("\0")
    .filter((chemin) =>
      extensions.some((extension) => chemin.endsWith(extension))
    )
}

/**
 * Le motif d'un chargement de module portant ce nom-là : un `import`, un `from`,
 * un `require` — statique, dynamique ou résolu — plus les formes de
 * substitution qu'un test utilise pour ne pas charger le paquet. Une forme qui
 * n'est pas dans cette liste est une forme que la garde ne voit pas ; elle
 * s'ajoute ici le jour où elle apparaît, pas après.
 */
function motifDappel(nom: string): RegExp {
  const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const specificateur = String.raw`["']${echappe}(?:/[^"']*)?["']`
  return new RegExp(
    `(?:\\bfrom\\b|\\bimport\\b|\\brequire\\b|\\bmock\\b|\\bresolve\\b)\\s*\\(?\\s*${specificateur}`
  )
}

describe("installed braces (GHSA-vfj7-8cjw-p6xm, CVE-2026-93687)", () => {
  it("has at least one copy to guard", () => {
    expect(copies(arbre(), PAQUET).length).toBeGreaterThan(0)
  })

  it("keeps every copy out of the production dependency graph", () => {
    const livre = manifeste()
    const racines = [
      ...Object.keys(livre.dependencies ?? {}),
      ...Object.keys(livre.optionalDependencies ?? {}),
    ]
    const coupables: string[] = []
    for (const copie of copies(arbre(), PAQUET)) {
      for (const racine of racines) {
        if (atteignables(arbre(), [racine]).has(copie)) {
          coupables.push(`${racine} atteint ${copie}`)
        }
      }
    }
    expect(
      coupables,
      `une dépendance de production atteint ${PAQUET} :\n${coupables.join("\n")}`
    ).toEqual([])
  })

  it("hangs every copy from development tooling", () => {
    const developpement = atteignables(
      arbre(),
      Object.keys(manifeste().devDependencies ?? {})
    )
    for (const copie of copies(arbre(), PAQUET)) {
      expect(
        developpement.has(copie),
        `${copie} n'est atteinte ni par la production ni par le développement`
      ).toBe(true)
    }
  })
})

describe("the repository never calls a brace expander", () => {
  it("imports no package whose closure reaches braces", () => {
    const portesNommees = portes(arbre(), PAQUET)
    expect(
      [...portesNommees].length,
      `aucune porte vers ${PAQUET} : l'arbre lu ne contient pas le paquet`
    ).toBeGreaterThan(0)
    const motifs = [...portesNommees].map(
      (nom) => [nom, motifDappel(nom)] as const
    )
    const coupables: string[] = []
    for (const chemin of fichiersSources()) {
      const texte = readFileSync(path.join(RACINE, chemin), "utf8")
      for (const [nom, motif] of motifs) {
        if (motif.test(texte)) coupables.push(`${chemin} importe ${nom}`)
      }
    }
    expect(
      coupables,
      `un fichier indexé atteint une pile qui développe des accolades :\n${coupables.join("\n")}`
    ).toEqual([])
  })
})
