import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import { ESLint, type Linter } from "eslint"
import { describe, expect, it } from "vitest"

const RACINE = import.meta.dirname
const GITIGNORE = path.join(RACINE, ".gitignore")

const SONDE = "essai-du-linter.ts"

const DOSSIERS_NOMMES = [".scratch", "coverage", "notes"]

const CONTENU_SONDE = `export const comparer = (entree: string): boolean => {
  const jamaisLu = "présente"
  return entree.length > 0
}
`

const METACARACTERES = /[*?[\]!]/

function nomsAncres(): string[] {
  const motifs = readFileSync(GITIGNORE, "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(
      (motif) =>
        motif !== "" && !motif.startsWith("#") && !motif.startsWith("!")
    )
    .map((motif) => motif.replace(/^\//, "").replace(/\/$/, ""))
    .filter((nom) => !METACARACTERES.test(nom) && !nom.includes("/"))

  return [...new Set(motifs)].sort()
}

const HORS_COMPARAISON = new Map([
  [
    ".pnp",
    "le magasin virtuel de pnpm. Ce que pnpm écrit a ce nom est `.pnp.cjs`, un fichier, déjà nommé par le motif suivant ; aucun dossier de ce nom n'est créé.",
  ],
  [
    ".DS_Store",
    "le fichier de Finder, que macOS dépose à la racine. Le linter ne l'examinerait pas de lui-même.",
  ],
  [
    "next-env.d.ts",
    "le fichier que Next régénère, un fichier et non un dossier, et que `eslint.config.mjs` écarte déjà pour une autre raison : celle d'`eslint-config-next`.",
  ],
])

function dossiersIgnores(): string[] {
  return nomsAncres().filter((nom) => !HORS_COMPARAISON.has(nom))
}

function fichiersSuivis(): string[] {
  const enumeration = spawnSync("git", ["ls-files"], {
    cwd: RACINE,
    encoding: "utf8",
    timeout: 60_000,
  })

  if (enumeration.status !== 0) {
    throw new Error(`git ls-files : ${enumeration.stderr ?? "sans diagnostic"}`)
  }

  return (enumeration.stdout ?? "").split("\n").filter(Boolean)
}

function entetesIgnoreesParGit(): Set<string> {
  const interrogation = spawnSync(
    "git",
    ["check-ignore", "--no-index", "-z", "--stdin"],
    {
      cwd: RACINE,
      encoding: "utf8",
      input: `${entetesDePremierNiveau().join("\0")}\0`,
    }
  )

  if (interrogation.status !== 0 && interrogation.status !== 1) {
    throw new Error(
      `git check-ignore : ${interrogation.stderr ?? "sans diagnostic"}`
    )
  }

  return new Set((interrogation.stdout ?? "").split("\0").filter(Boolean))
}

function entetesDePremierNiveau(): string[] {
  return [...new Set(fichiersSuivis().map((fichier) => fichier.split("/")[0]))]
}

function dossiersSuivis(): string[] {
  const prefixes = new Set<string>()
  for (const fichier of fichiersSuivis()) {
    const morceaux = fichier.split("/")
    for (let profondeur = 1; profondeur < morceaux.length; profondeur++) {
      prefixes.add(morceaux.slice(0, profondeur).join("/"))
    }
  }

  const ignores = entetesIgnoreesParGit()
  return [...prefixes]
    .filter((dossier) => !ignores.has(dossier.split("/")[0]))
    .sort()
}

const LINTER = new ESLint({ cwd: RACINE, warnIgnored: false })

const EXTENSIONS_SONDEES = ["ts", "tsx"]

function sondesDe(dossier: string): string[] {
  return EXTENSIONS_SONDEES.map((extension) =>
    path.join(RACINE, dossier, `essai-du-linter.${extension}`)
  )
}

async function sonder(dossier: string): Promise<Linter.LintMessage[]> {
  const chemin = sondesDe(dossier)[0]
  const parent = path.dirname(chemin)
  const existait = existsSync(parent)

  mkdirSync(parent, { recursive: true })
  try {
    writeFileSync(chemin, CONTENU_SONDE)
    const resultats = await LINTER.lintFiles([chemin])
    return resultats.flatMap((resultat) => resultat.messages)
  } finally {
    rmSync(chemin, { force: true })
    if (!existait) {
      rmSync(parent, { force: true, recursive: true })
    }
  }
}

describe("la correspondance entre ce que git ignore et ce que le linter ignore", () => {
  it("dérive des dossiers, pas une liste vide", () => {
    const trouves = dossiersIgnores()

    for (const attendu of DOSSIERS_NOMMES) {
      expect(trouves, `« ${attendu} » est ignoré par git.`).toContain(attendu)
    }
  })

  it("exclut du linter chacun des dossiers que `.gitignore` exclut", async () => {
    const rapportes: string[] = []

    for (const dossier of dossiersIgnores()) {
      const echappe = await LINTER.isPathIgnored(
        path.join(RACINE, dossier, SONDE)
      )
      if (!echappe) {
        rapportes.push(
          `« ${dossier}/ » est ignoré par git et ne l'est pas du linter : le premier fichier que quelqu'un y posera rendra ` +
            `« npm run lint » rouge sur la seule machine qui l'a produit, et sur aucune autre.`
        )
      }
    }

    expect(rapportes).toEqual([])
  })

  it("n'écarte aucun dossier que git connaît", async () => {
    const eteintes: string[] = []

    for (const dossier of dossiersSuivis()) {
      for (const sonde of sondesDe(dossier)) {
        if (await LINTER.isPathIgnored(sonde)) {
          eteintes.push(path.relative(RACINE, sonde))
        }
      }
    }

    expect(
      eteintes.map(
        (sonde) =>
          `« ${sonde} » est dans un dossier que git connaît et n'ignore pas, et le linter l'écarte pourtant : la correction a éteint plus qu'elle ne devait.`
      )
    ).toEqual([])
  })

  it("ne garde hors comparaison aucun nom que `.gitignore` ne porte plus", () => {
    const perimes = [...HORS_COMPARAISON.keys()].filter(
      (nom) => !nomsAncres().includes(nom)
    )

    expect(
      perimes.map(
        (nom) =>
          `« ${nom} » est écarté de la comparaison alors que \`.gitignore\` ne le nomme plus (raison donnée : ${HORS_COMPARAISON.get(nom)}).`
      )
    ).toEqual([])
  })
})

describe("un fichier TypeScript mal formé sous un dossier ignoré n'est pas signalé", () => {
  it("ne dit rien du fichier planté dans chacun des trois", async () => {
    const rapportes: string[] = []

    for (const dossier of DOSSIERS_NOMMES) {
      const messages = await sonder(dossier)
      if (messages.length > 0) {
        rapportes.push(
          `« ${dossier}/${SONDE} » est signalé : ${messages
            .map(
              (message) =>
                `${message.ruleId ?? "erreur de lecture"} — ${message.message}`
            )
            .join(", ")}`
        )
      }
    }

    expect(rapportes).toEqual([])
  })

  it("signale pourtant le même fichier à la racine, où le linter descend", async () => {
    const messages = await sonder(".")

    expect(messages.map((message) => message.ruleId)).toContain(
      "@typescript-eslint/no-unused-vars"
    )
  })
})
