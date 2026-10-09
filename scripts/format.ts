import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const RACINE = path.resolve(import.meta.dirname, "..")

const JEU_DE_FICHIERS = "**/*.{ts,tsx}"

function lireLesExtensions(jeu: string): string[] {
  const trouve = /\{([\w.,-]+)\}$/.exec(jeu)
  if (!trouve) {
    throw new Error(
      `${jeu} : extensions illisibles, la porte ne sait plus ce qu'elle couvre`
    )
  }
  return trouve[1].split(",")
}

const EXTENSIONS = lireLesExtensions(JEU_DE_FICHIERS)

const MARQUEUR_ECRITURE = "--ecrire"

const MARQUEUR_INDEX = "--indexes"

const EXECUTABLE_PRETTIER = createRequire(import.meta.url).resolve(
  "prettier/bin/prettier.cjs"
)

function couvreLeJeu(chemin: string): boolean {
  return EXTENSIONS.some((extension) => chemin.endsWith(`.${extension}`))
}

function ecrireLesFichiersCouverts(): void {
  const lecture = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { cwd: process.cwd(), encoding: "utf8" }
  )

  if (lecture.error !== undefined) {
    process.stderr.write(
      `lecture de l'index impossible : ${lecture.error.message}\n`
    )
    process.exitCode = 1
    return
  }
  if (lecture.status !== 0) {
    const cause =
      (lecture.stderr ?? "").trim() || `code de sortie ${lecture.status}`
    process.stderr.write(`lecture de l'index impossible : ${cause}\n`)
    process.exitCode = 1
    return
  }

  const couverts = (lecture.stdout ?? "")
    .split("\0")
    .filter((chemin) => chemin !== "" && couvreLeJeu(chemin))

  process.stdout.write(couverts.length > 0 ? `${couverts.join("\n")}\n` : "")
}

const argumentsInvocation = process.argv.slice(2)
const corriger = argumentsInvocation.includes(MARQUEUR_ECRITURE)
const demanderLesIndexes = argumentsInvocation.includes(MARQUEUR_INDEX)
const argumentsPrettier = argumentsInvocation.filter(
  (argument) => argument !== MARQUEUR_ECRITURE && argument !== MARQUEUR_INDEX
)

if (demanderLesIndexes) {
  ecrireLesFichiersCouverts()
} else {
  const cible =
    argumentsPrettier.length > 0 ? argumentsPrettier : [JEU_DE_FICHIERS]

  const execution = spawnSync(
    process.execPath,
    [EXECUTABLE_PRETTIER, corriger ? "--write" : "--check", ...cible],
    { cwd: RACINE, stdio: "inherit" }
  )

  process.exitCode = execution.status ?? 1
}
