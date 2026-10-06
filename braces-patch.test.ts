import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * GHSA-vfj7-8cjw-p6xm (CVE-2026-93687) : `braces` parcourt son arbre
 * d'accolades par récursion, une image de pile par niveau d'imbrication, sans
 * garde de profondeur. Un motif court — il passe sous le plafond de 10 000
 * caractères que `parse` contrôle — et très imbriqué épuise la pile ; le
 * `RangeError` que personne n'attrape tue le processus Node. Sur cette machine,
 * 4 000 accolades emboîtées — 8 001 caractères, un cinquième du plafond — font
 * tomber `braces()` lui-même, et 4 000 parenthèses emboîtées tombent aussi :
 * `parse` empile les deux, et `compile`, `expand` et `stringify` récurssent sur
 * les deux.
 *
 * Aucun correctif n'existe à écrire en version : `3.0.3` est la dernière
 * publication du registre et l'avis la déclare vulnérable jusqu'à elle
 * comprise. Les autres guards de correctif épinglent donc un plancher, et il
 * n'y a rien à épingler ici — un plancher plus bas que la seule version
 * publiée serait une garde rouge dès l'installation.
 *
 * Ce qui se corrige est le graphe, et le graphe porte désormais sa propre
 * copie : `vendor/braces/` est `3.0.3` avec une garde de profondeur dans
 * `parse()`, et `package.json` y renvoie la copie installée par un
 * `file:vendor/braces` doublé d'un `overrides` qui y ramène chaque demandeur
 * transitif. Le paquet livré reste hors du graphe de production, comme le
 * commit précédent l'a établi ; ce qui change est que la copie de développement
 * n'est plus celle de l'avis.
 *
 * Les tests qui suivent épinglent ce qui rend cela stable : l'arbre n'installe
 * plus de version du registre ; la copie vendue refuse la profondeur au lieu
 * d'épuiser la pile ; elle rend toujours les motifs ordinaires ; aucun paquet
 * livré ne l'atteint ; et l'image porte la copie avant son installation.
 */

const RACINE = process.cwd()

/** Le paquet que l'avis nomme ; les gardes le cherchent par ce nom dans l'arbre. */
const PAQUET = "braces"

/** La copie vendue : c'est elle que l'installation doit résoudre. */
const VERSION_VENDUE = "3.0.4-patched.0"

/** Le dossier vendu, relatif à la racine, tel que `package.json` le nomme. */
const DOSSIER_VENDU = "vendor/braces"

/**
 * La profondeur d'imbrication que ce dépôt épingle, et non celle qu'il lirait
 * dans le fichier vendu : une borne lue à sa source suivrait la source partout,
 * et un `MAX_DEPTH` levé à 10 000 laisserait ce fichier vert. La valeur est donc
 * écrite ici, et le test qui suit la fait mordre dans les deux sens.
 */
const PROFONDEUR_MAX = 100

type Entree = {
  version?: string
  link?: boolean
  resolved?: string
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
  overrides?: Record<string, string>
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
 * comme dépendances, dans l'ordre de résolution. Les gardes du fichier
 * arpentent toutes ces arêtes ; chacune n'a qu'un sens différent à prendre.
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

type ManifesteVendu = {
  dependencies?: Record<string, string>
}

/** Le manifeste de la copie vendue, lu là où `package.json` la nomme. */
function manifesteVendu(): ManifesteVendu {
  return JSON.parse(
    readFileSync(path.join(RACINE, DOSSIER_VENDU, "package.json"), "utf8")
  ) as ManifesteVendu
}

describe("installed braces (GHSA-vfj7-8cjw-p6xm, CVE-2026-93687)", () => {
  it("resolves to the vendored copy, not to a registry release", () => {
    const manifestPath = createRequire(import.meta.url).resolve(
      "braces/package.json"
    )
    expect(
      path.relative(RACINE, manifestPath),
      "le paquet résolu n'est pas la copie vendue"
    ).toBe(path.join(DOSSIER_VENDU, "package.json"))

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: unknown
    }
    expect(manifest.version).toBe(VERSION_VENDUE)
  })

  it("leaves no registry release of the package in the lockfile", () => {
    const dans = arbre()
    const installees = copies(dans, PAQUET)
    expect(installees.length).toBeGreaterThan(0)

    for (const copie of installees) {
      const entree = dans[copie] ?? {}
      expect(
        entree.link,
        `${copie} n'est pas un lien vers ${DOSSIER_VENDU} : c'est une copie du registre, donc la version de l'avis`
      ).toBe(true)
      expect(entree.resolved).toBe(DOSSIER_VENDU)
      expect(entree.version).toBeUndefined()
    }

    const vendue = dans[DOSSIER_VENDU]
    expect(
      vendue,
      `${DOSSIER_VENDU} est absent du lockfile : l'installation ne reproduira pas la copie vendue`
    ).toBeDefined()
    expect(vendue?.version).toBe(VERSION_VENDUE)
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

/**
 * Le motif hostile : `profondeur` ouvrantes, une lettre, autant de fermantes.
 * 4 000 tiennent en 8 001 caractères — sous le plafond de 10 000 que `parse`
 * contrôle — et suffisent à faire tomber la version du registre sur cette
 * machine.
 */
function motifImbrique(ouvrante: string, fermante: string, profondeur: number) {
  return ouvrante.repeat(profondeur) + "a" + fermante.repeat(profondeur)
}

/**
 * Le témoin tourne dans un processus à part : un `RangeError` non attrapé tue
 * le processus qui l'a levé, et le faire tomber dans le processus de vitest
 * rapporterait un plantage au lieu d'un échec lisible. Le script rend, pour
 * chaque cas, le nom de l'erreur attrapée ou `rendu` si l'appel a abouti.
 */
const SCRIPT_TEMOIN = `
const braces = require("braces")
// La forme du motif est celle de \`motifImbrique\` ci-dessus, recopiée : le
// témoin tourne dans un processus qui n'a rien à importer.
const motif = (ouvrante, fermante, profondeur) =>
  ouvrante.repeat(profondeur) + "a" + fermante.repeat(profondeur)
const cas = {
  accolades: motif("{", "}", 4000),
  parentheses: motif("(", ")", 4000)
}
// Les trois parcoureurs que l'avis nomme : compile, expand, stringify.
const modes = {
  compile: (pattern) => braces(pattern),
  expand: (pattern) => braces.expand(pattern),
  stringify: (pattern) => braces.stringify(pattern)
}
const rapport = {}
for (const [nom, pattern] of Object.entries(cas)) {
  for (const [mode, appel] of Object.entries(modes)) {
    try {
      appel(pattern)
      rapport[nom + ":" + mode] = "rendu"
    } catch (error) {
      rapport[nom + ":" + mode] = error.constructor.name
    }
  }
}
console.log(JSON.stringify(rapport))
`

describe("the vendored copy bounds nesting depth (GHSA-vfj7-8cjw-p6xm)", () => {
  it("refuses a deeply nested pattern instead of exhausting the stack", () => {
    const execution = spawnSync(process.execPath, ["--eval", SCRIPT_TEMOIN], {
      cwd: RACINE,
      encoding: "utf8",
      timeout: 30_000,
    })

    expect(
      execution.status,
      `le témoin est sorti avec ${String(execution.status)}\n` +
        `stdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`
    ).toBe(0)
    expect(execution.stderr).not.toMatch(/Maximum call stack/i)

    const rapport = JSON.parse(execution.stdout) as Record<string, string>
    expect(Object.keys(rapport).sort()).toEqual([
      "accolades:compile",
      "accolades:expand",
      "accolades:stringify",
      "parentheses:compile",
      "parentheses:expand",
      "parentheses:stringify",
    ])
    for (const [cas, verdict] of Object.entries(rapport)) {
      expect(
        verdict,
        `${cas} : ${verdict} — la garde de profondeur n'a pas mordu`
      ).toBe("SyntaxError")
    }
  })

  it("still compiles and expands the patterns the repository feeds it", () => {
    const braces = createRequire(import.meta.url)("braces") as {
      (pattern: string): string[]
      expand: (pattern: string) => string[]
      compile: (pattern: string, options?: object) => string
    }

    expect(braces("a/{x,y}/b")).toEqual(["a/(x|y)/b"])
    expect(braces.expand("a/{x,y}/b")).toEqual(["a/x/b", "a/y/b"])
    expect(braces.expand("a/{01..03}/b")).toEqual([
      "a/01/b",
      "a/02/b",
      "a/03/b",
    ])

    const profondMaisPermis = motifImbrique("{", "}", PROFONDEUR_MAX)
    expect(() => braces(profondMaisPermis)).not.toThrow()
    expect(() => braces(motifImbrique("(", ")", PROFONDEUR_MAX))).not.toThrow()
  })

  it("refuses the first level past the bound, and lets a caller lower it", () => {
    const braces = createRequire(import.meta.url)("braces") as {
      (pattern: string, options?: object): string[]
    }

    const justeAuDela = motifImbrique("{", "}", PROFONDEUR_MAX + 1)
    expect(() => braces(justeAuDela)).toThrow(SyntaxError)

    // Le plafond suit celui de `maxLength` : l'appelant peut le baisser, et
    // jamais le lever au-delà de la garde du paquet.
    expect(() => braces("{a,{b,c}}", { maxDepth: 1 })).toThrow(SyntaxError)
    expect(() => braces("{a,{b,c}}", { maxDepth: 2 })).not.toThrow()
  })
})

/**
 * Le seul fichier indexé que la garde laisse charger le paquet : celui-ci, dont
 * c'est le métier de l'éprouver. Nommé plutôt que deviné — un second fichier
 * qui chargerait `braces` doit faire rouge, et c'est cette liste qui le dit.
 */
const FICHIERS_QUI_EPROUVENT = new Set(["braces-patch.test.ts"])

/**
 * Les dossiers vendus sont le paquet, pas des consommateurs de paquet : la
 * documentation de `vendor/braces/index.js` cite `require('braces')` en exemple,
 * et la garde vise ceux qui l'importent, non le paquet lui-même.
 */
const DOSSIERS_VENDUS = ["vendor/"]

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
      if (FICHIERS_QUI_EPROUVENT.has(chemin)) continue
      if (DOSSIERS_VENDUS.some((dossier) => chemin.startsWith(dossier)))
        continue
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

describe("package.json points the package at its vendored copy", () => {
  it("declares the copy as a development dependency", () => {
    expect(manifeste().devDependencies?.[PAQUET]).toBe(`file:${DOSSIER_VENDU}`)
  })

  it("routes every transitive requirer back to that copy", () => {
    // `$braces` est la forme par laquelle npm renvoie un override vers la
    // dépendance directe du même nom : sans elle, `micromatch` réclamerait
    // `^3.0.3` et npm résoudrait la publication du registre.
    expect(manifeste().overrides?.[PAQUET]).toBe(`$${PAQUET}`)
  })

  it("keeps the vendored copy's own dependency declared", () => {
    // La copie vendue n'est pas autonome : `compile` et `expand` passent par
    // `fill-range` pour les plages. Un manifeste vendu qui perdrait cette
    // dépendance casserait les motifs à plage sans que rien ne le nomme.
    expect(manifesteVendu().dependencies?.["fill-range"]).toBeDefined()
  })
})

/**
 * Les dossiers de premier niveau que `package.json` installe depuis le dépôt —
 * les `file:` —, dérivés du manifeste et non écrits ici. C'est ce que l'image
 * doit porter avant son `npm ci`, et rien d'autre ne le lui dit : la CI ne
 * construit pas l'image, seul le déploiement le fait, si bien qu'un `COPY`
 * oublié ne se verrait qu'en production.
 */
function dossiersLocaux(): string[] {
  const complet = manifeste()
  const specificateurs = [
    ...Object.values(complet.dependencies ?? {}),
    ...Object.values(complet.devDependencies ?? {}),
    ...Object.values(complet.optionalDependencies ?? {}),
  ]
  return [
    ...new Set(
      specificateurs
        .filter((specificateur) => specificateur.startsWith("file:"))
        .map(
          (specificateur) =>
            specificateur.slice("file:".length).split("/")[0] ?? ""
        )
    ),
  ]
}

describe("the Dockerfile carries the local packages before installing", () => {
  it("copies every file: source ahead of npm ci in the deps stage", () => {
    const dossiers = dossiersLocaux()
    expect(
      dossiers.length,
      "aucun `file:` au manifeste : la garde ne mesure plus rien"
    ).toBeGreaterThan(0)

    const dockerfile = readFileSync(path.join(RACINE, "Dockerfile"), "utf8")
    const debut = dockerfile.indexOf("AS deps")
    const fin = dockerfile.indexOf("AS builder")
    expect(debut, "l'étape deps a disparu du Dockerfile").toBeGreaterThan(-1)
    expect(fin).toBeGreaterThan(debut)

    const etape = dockerfile.slice(debut, fin)
    // Les commentaires ne sont pas des instructions : celui qui explique ce
    // `COPY` nomme « npm ci », et une recherche qui le lirait placerait
    // l'installation avant la copie qu'elle décrit.
    const instructions = etape
      .split("\n")
      .filter((ligne) => !ligne.trimStart().startsWith("#"))
      .join("\n")

    const commande = /^.*\bRUN\b.*\bnpm ci\b.*$/m.exec(instructions)
    expect(commande, "l'étape deps n'appelle plus `npm ci`").not.toBeNull()

    const avant = instructions.slice(0, commande?.index ?? 0)
    const manquants = dossiers.filter(
      (dossier) =>
        !new RegExp(String.raw`^COPY\s+${dossier}\b`, "m").test(avant)
    )
    expect(
      manquants,
      `le dossier local n'est pas copié avant « npm ci » :\n${manquants.join("\n")}`
    ).toEqual([])
  })
})
