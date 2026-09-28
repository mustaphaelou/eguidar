import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "format.ts")
const CONFIG = path.join(RACINE, ".prettierrc")

/** Le lanceur que le manifeste déclare, résolu sans dépendre du `PATH`. */
const LANCEUR = createRequire(import.meta.url).resolve("tsx/cli")

const DOSSIER = mkdtempSync(path.join(tmpdir(), "format-"))
const FICHIER = path.join(DOSSIER, "salutation.ts")
/** Un dépôt jetable, pour la seule lecture de l'index. */
const REPO = path.join(DOSSIER, "index")
const HORS_DEPO = path.join(DOSSIER, "pas-un-depot")

/**
 * Un fichier délibérément mal formé : espaces autour du deux-points, cinq
 * espaces d'indentation, aucun point-virgule, pas de saut de ligne final.
 * Chacune de ces violations tient sous la configuration du projet comme sous
 * celle par défaut de Prettier, donc le test ne tient pas d'un réglage
 * particulier de l'une ou de l'autre.
 */
const VIOLATION = `export const saluer = ( nom : string ) => {
     return "bonjour, " + nom
}`

function planterLaViolation(): void {
  writeFileSync(FICHIER, VIOLATION)
}

function lancer(
  lesArguments: string[],
  dossier: string = RACINE
): {
  sortie: string
  statut: number | null
} {
  const execution = spawnSync(
    process.execPath,
    [LANCEUR, SCRIPT, ...lesArguments],
    {
      cwd: dossier,
      encoding: "utf8",
      timeout: 60_000,
    }
  )

  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    statut: execution.status,
  }
}

/**
 * La porte et le correctif, pointés sur le fichier planté. `--config` est
 * explicite parce que le dossier temporaire est hors du dépôt : sans lui,
 * Prettier n'y trouverait aucune configuration et jugerait le fichier selon ses
 * valeurs par défaut, pas selon celles du projet.
 */
const lire = () => lancer(["--config", CONFIG, FICHIER])
const corriger = () => lancer(["--ecrire", "--config", CONFIG, FICHIER])

/**
 * L'identité git est passée à chaque commande plutôt que posée dans une
 * configuration : ce test n'écrit nulle part ailleurs, et il n'écrit surtout pas
 * dans l'index du dépôt qu'il est en train de tester.
 */
function git(...lesArguments: string[]): void {
  const execution = spawnSync(
    "git",
    [
      "-c",
      "user.email=essai@exemple",
      "-c",
      "user.name=Essai",
      ...lesArguments,
    ],
    { cwd: REPO, encoding: "utf8" }
  )
  if (execution.status !== 0) {
    throw new Error(
      `git ${lesArguments.join(" ")} : ${execution.stderr ?? "sans diagnostic"}`
    )
  }
}

function ecrire(chemin: string, valeur = 1): void {
  writeFileSync(path.join(REPO, chemin), `export const valeur = ${valeur}\n`)
}

/**
 * L'état que le crochet trouve au moment d'un commit : cinq fichiers modifiés
 * — dont un `.md` que la porte ne couvre pas, un `.tsx` imbriqué et un nom
 * porteur d'un espace et d'un accent — et un fichier supprimé de l'arbre. Tout
 * est déjà écrit une fois, pour que la suppression soit une vraie suppression
 * et non un fichier qui n'a jamais existé.
 */
function preparerLeDepot(): void {
  mkdirSync(path.join(REPO, "compose"), { recursive: true })
  mkdirSync(HORS_DEPO)
  ecrire("couvert.ts")
  ecrire("compose/imbrique.tsx")
  ecrire("ecarte.md")
  ecrire("espace accentué.ts")
  ecrire("supprime.ts")

  git("init", "--quiet", ".")
  git("add", ".")
  git("commit", "--quiet", "--message", "départ")

  ecrire("couvert.ts", 2)
  ecrire("compose/imbrique.tsx", 2)
  ecrire("ecarte.md", 2)
  ecrire("espace accentué.ts", 2)
  rmSync(path.join(REPO, "supprime.ts"))
  git("add", "--all", ".")
}

beforeAll(() => {
  preparerLeDepot()
})

afterAll(() => {
  rmSync(DOSSIER, { force: true, recursive: true })
})

describe("scripts/format.ts — la porte mord, et le correctif la fait taire", () => {
  it("sort en erreur en nommant le fichier, puis sort en zéro après le correctif", () => {
    planterLaViolation()

    const avant = lire()

    expect(avant.statut).not.toBe(0)
    expect(avant.sortie).toContain("salutation.ts")

    const correction = corriger()
    const apres = lire()

    expect(correction.statut).toBe(0)
    expect(readFileSync(FICHIER, "utf8")).not.toBe(VIOLATION)

    // C'est cet aller-retour qui prouve que les deux scripts partagent le même
    // jeu de fichiers. Une dérive entre le correctif et la porte laisserait la
    // porte rouge ici ; rien d'autre dans le dépôt ne le remarquerait.
    expect(apres.statut).toBe(0)
    expect(apres.sortie).not.toContain("salutation.ts")
  })
})

describe("l'énumération que le crochet consume", () => {
  it("nomme les fichiers indexés du jeu, et aucun autre", () => {
    const enumeration = lancer(["--indexes"], REPO)

    // Le `.md` est écarté, le fichier supprimé aussi : il n'existe plus, donc il
    // ne peut pas violer quoi que ce soit.
    expect(enumeration.statut).toBe(0)
    expect(enumeration.sortie.trim().split("\n").sort()).toEqual([
      "compose/imbrique.tsx",
      "couvert.ts",
      "espace accentué.ts",
    ])
  })

  it("ne nomme plus rien dès que l'index n'a plus rien à dire", () => {
    // Le silence est un retour attendu, pas un oubli : c'est ce qui laisse le
    // crochet sortir sans un mot quand il n'a rien à signaler.
    git("commit", "--quiet", "--message", "tout est indexé")

    const enumeration = lancer(["--indexes"], REPO)

    expect(enumeration.statut).toBe(0)
    expect(enumeration.sortie.trim()).toBe("")
  })

  it("sort en erreur en nommant la cause quand l'index ne se lit pas", () => {
    // Hors de tout dépôt, `git` n'envoie pas une liste vide : il échoue. La
    // différence est tout le sujet, car un crochet dont la plomberie échoue en
    // silence passe pour un crochet qui n'a rien trouvé.
    const horsDepot = lancer(["--indexes"], HORS_DEPO)

    expect(horsDepot.statut).not.toBe(0)
    expect(horsDepot.sortie).toContain("lecture de l'index impossible")
  })
})

describe("la déclaration de la porte", () => {
  it("déclare la porte et le correctif comme deux appels au même script", () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(RACINE, "package.json"), "utf8")
    ) as { scripts: Record<string, string> }

    expect(scripts["format"]).toContain("scripts/format.ts")
    expect(scripts["format:check"]).toContain("scripts/format.ts")

    // Un glob recopié dans le manifeste serait exactement la dérive que le test
    // précédent ne voit pas : ni l'un ni l'autre n'en porte.
    expect(scripts["format"]).not.toContain("*")
    expect(scripts["format:check"]).not.toContain("*")
  })

  it("exclut les worktrees imbriqués dans sa propre configuration d'ignore", () => {
    const ignores = readFileSync(path.join(RACINE, ".prettierignore"), "utf8")

    // Sans cette ligne, l'exclusion ne tient plus que par le fait que Prettier
    // lit `.gitignore` par défaut — le même pari que `vitest.config.ts` et
    // `eslint.config.mjs` ont cessé de prendre pour argent comptant.
    expect(ignores).toMatch(/^\.worktrees\/$/m)
  })
})
