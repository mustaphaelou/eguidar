import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = process.cwd()

const PAQUET = "braces"

const VERSION_VENDUE = "3.0.4-patched.0"

const DOSSIER_VENDU = "vendor/braces"

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

function arbre(): Arbre {
  const lock = JSON.parse(
    readFileSync(path.join(RACINE, "package-lock.json"), "utf8")
  ) as { packages?: Arbre }
  return lock.packages ?? {}
}

function manifeste(): Manifeste {
  return JSON.parse(
    readFileSync(path.join(RACINE, "package.json"), "utf8")
  ) as Manifeste
}

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

function demandes(entree: Entree): string[] {
  const optionnelles = new Set(Object.keys(entree.optionalDependencies ?? {}))
  const exigees = new Set(Object.keys(entree.dependencies ?? {}))
  const paires = Object.keys(entree.peerDependencies ?? {}).filter(
    (nom) => entree.peerDependenciesMeta?.[nom]?.optional !== true
  )
  return [...new Set([...exigees, ...optionnelles, ...paires])]
}

function voisins(dans: Arbre, chemin: string): string[] {
  const suite: string[] = []
  for (const nom of demandes(dans[chemin] ?? {})) {
    const suivant = resoudre(dans, chemin, nom)
    if (suivant !== null) suite.push(suivant)
  }
  return suite
}

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

function copies(dans: Arbre, paquet: string): string[] {
  return Object.keys(dans).filter((cle) =>
    new RegExp(String.raw`(^|/)node_modules/${paquet}$`).test(cle)
  )
}

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

function motifImbrique(ouvrante: string, fermante: string, profondeur: number) {
  return ouvrante.repeat(profondeur) + "a" + fermante.repeat(profondeur)
}

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

    expect(() => braces("{a,{b,c}}", { maxDepth: 1 })).toThrow(SyntaxError)
    expect(() => braces("{a,{b,c}}", { maxDepth: 2 })).not.toThrow()
  })
})

const FICHIERS_QUI_EPROUVENT = new Set(["braces-patch.test.ts"])

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
    expect(manifeste().overrides?.[PAQUET]).toBe(`$${PAQUET}`)
  })

  it("keeps the vendored copy's own dependency declared", () => {
    expect(manifesteVendu().dependencies?.["fill-range"]).toBeDefined()
  })
})

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
