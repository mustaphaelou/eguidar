import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "verifier-catalogue-de-build.ts")
const MANIFESTE = path.join(RACINE, "package.json")

const LANCEUR = createRequire(import.meta.url).resolve("tsx/cli")

const URL_INJOIGNABLE =
  "postgresql://eguidar:eguidar@127.0.0.1:1/eguidar_absente"

function lancer(databaseUrl: string | undefined): {
  sortie: string
  statut: number | null
} {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Le script charge `.env` par défaut ; ce test fixe l'environnement, comme
    // le build Docker où aucun fichier d'environnement n'existe.
    DOTENV_CONFIG_PATH: path.join(RACINE, ".env.absent"),
  }
  if (databaseUrl === undefined) {
    delete env.DATABASE_URL
  } else {
    env.DATABASE_URL = databaseUrl
  }

  const execution = spawnSync(process.execPath, [LANCEUR, SCRIPT], {
    cwd: RACINE,
    env,
    encoding: "utf8",
    timeout: 30_000,
  })

  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    statut: execution.status,
  }
}

describe("le preflight du catalogue avant next build", () => {
  it("refuse un build sans DATABASE_URL, en nommant le catalogue", () => {
    const execution = lancer(undefined)

    expect(execution.statut).toBe(1)
    expect(execution.sortie).toContain("ECHEC")
    expect(execution.sortie).toContain("catalogue")
    expect(execution.sortie).toContain("DATABASE_URL")
  })

  it("refuse un build lorsque le catalogue est injoignable, en nommant le catalogue", () => {
    const execution = lancer(URL_INJOIGNABLE)

    expect(execution.statut).toBe(1)
    expect(execution.sortie).toContain("ECHEC")
    expect(execution.sortie).toContain("catalogue")
  })

  it("laisse passer un build quand le catalogue est joignable, fût-il vide", () => {
    const execution = lancer(process.env.TEST_DATABASE_URL)

    expect(execution.statut).toBe(0)
    expect(execution.sortie).toContain("[catalogue]")
  })
})

describe("le manifeste branche le preflight avant la construction", () => {
  const manifeste = JSON.parse(readFileSync(MANIFESTE, "utf8")) as {
    scripts: Record<string, string>
  }

  it("fait du preflight la première moitié de `build`", () => {
    expect(manifeste.scripts.build).toBe(
      "tsx scripts/verifier-catalogue-de-build.ts && next build"
    )
  })

  it("ne garde pas l'ancien `build:check`, que plus rien ne peut honorer", () => {
    expect(manifeste.scripts).not.toHaveProperty("build:check")
  })
})
