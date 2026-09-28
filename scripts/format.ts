import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const RACINE = path.resolve(import.meta.dirname, "..")

/**
 * Le jeu de fichiers que le projet formatte, écrit une seule fois et ici
 * seulement. La porte et le correctif le prennent tous les deux d'ici, et le
 * crochet par l'énumération ci-dessous : ils ne peuvent pas diverger parce
 * qu'ils n'ont qu'une source. L'élargir au-delà du TypeScript et du TSX est une
 * décision à part, pas un effet de bord.
 */
const JEU_DE_FICHIERS = "**/*.{ts,tsx}"

/**
 * Les extensions que ce glob couvre, lues dans le glob lui-même plutôt que
 * recopiées à côté : un crochet qui garde sa propre liste s'arrête de couvrir
 * ce que la porte couvre dès que le glob s'élargit, et ne s'en aperçoit pas.
 * Un glob qui cesserait d'être une accolade d'extensions arrête la porte
 * entière, ce qui vaut mieux qu'un crochet muet.
 */
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

/** Marqueur qui fait passer cette invocation en correction au lieu de lecture. */
const MARQUEUR_ECRITURE = "--ecrire"

/**
 * Marqueur qui remplace l'appel à Prettier par l'énumération des fichiers
 * indexés que la porte couvre, un par ligne. C'est la seule question que le
 * crochet pose à cette porte ; il n'a pas son propre filtre, donc pas de jeu de
 * fichiers à garder à jour.
 */
const MARQUEUR_INDEX = "--indexes"

const EXECUTABLE_PRETTIER = createRequire(import.meta.url).resolve(
  "prettier/bin/prettier.cjs"
)

function couvreLeJeu(chemin: string): boolean {
  return EXTENSIONS.some((extension) => chemin.endsWith(`.${extension}`))
}

/**
 * Écrit les chemins indexés que la porte couvre, séparés par un saut de ligne,
 * et rien d'autre.
 *
 * `-diff-filter=ACMR` écarte les suppressions : un fichier qui n'existe plus ne
 * peut pas violer le format. La lecture porte sur l'index tel qu'il est, sans
 * jamais l'écrire.
 *
 * L'appel se fait depuis le dossier courant : c'est le dépôt qui s'y trouve que
 * git doit lire, et `git` qualifiant toujours ses chemins par la racine de ce
 * dépôt, le crochet se recale sur cette racine avant d'appeler. Une lecture qui
 * échoue sort en erreur en nommant la cause : c'est le seul moyen, pour
 * l'appelant, de distinguer un index vide d'une plomberie défaillante — les
 * deux se ressemblent quand on se contente de lire une liste.
 */
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

  // L'écart entre cette liste et le glob se joue dans un dossier à point, que
  // le glob ne descend pas : on y demande donc un fichier de plus que la porte
  // n'en exige, jamais un de moins.
  process.stdout.write(couverts.length > 0 ? `${couverts.join("\n")}\n` : "")
}

const argumentsInvocation = process.argv.slice(2)
const corriger = argumentsInvocation.includes(MARQUEUR_ECRITURE)
const demanderLesIndexes = argumentsInvocation.includes(MARQUEUR_INDEX)
// Tout le reste part tel quel à Prettier, options comprises. C'est ce qui
// permet de pointer la porte sur un fichier planté sans que le jeu de fichiers
// par défaut change de nature.
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

  // Un signal suffit aussi à faire échouer la porte : `status` est alors nul.
  process.exitCode = execution.status ?? 1
}
