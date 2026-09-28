import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const RACINE = path.resolve(import.meta.dirname, "..")

/**
 * Le jeu de fichiers que le projet formatte, écrit une seule fois et ici
 * seulement. La porte et le correctif le prennent tous les deux d'ici : ils ne
 * peuvent pas diverger parce qu'ils n'ont qu'une source. L'élargir au-delà du
 * TypeScript et du TSX est une décision à part, pas un effet de bord.
 */
const JEU_DE_FICHIERS = "**/*.{ts,tsx}"

/** Marqueur qui fait passer cette invocation en correction au lieu de lecture. */
const MARQUEUR_ECRITURE = "--ecrire"

const EXECUTABLE_PRETTIER = createRequire(import.meta.url).resolve(
  "prettier/bin/prettier.cjs"
)

const argumentsInvocation = process.argv.slice(2)
const corriger = argumentsInvocation.includes(MARQUEUR_ECRITURE)
// Tout le reste part tel quel à Prettier, options comprises. C'est ce qui
// permet de pointer la porte sur un fichier planté sans que le jeu de fichiers
// par défaut change de nature.
const argumentsPrettier = argumentsInvocation.filter(
  (argument) => argument !== MARQUEUR_ECRITURE
)
const cible =
  argumentsPrettier.length > 0 ? argumentsPrettier : [JEU_DE_FICHIERS]

const execution = spawnSync(
  process.execPath,
  [EXECUTABLE_PRETTIER, corriger ? "--write" : "--check", ...cible],
  { cwd: RACINE, stdio: "inherit" }
)

// Un signal suffit aussi à faire échouer la porte : `status` est alors nul.
process.exitCode = execution.status ?? 1
