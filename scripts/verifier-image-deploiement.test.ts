import { spawnSync } from "node:child_process"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "verifier-image-deploiement.sh")

describe("scripts/verifier-image-deploiement.sh — interface d'environnement", () => {
  it("s'arrête avant Docker et nomme la première variable requise absente", () => {
    const execution = spawnSync("/bin/bash", [SCRIPT], {
      // Un environnement vide : ni PATH, ni Docker, ni base. Le contrat doit
      // tenir avant tout appel à Docker.
      env: {} as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 30_000,
    })

    expect(execution.status).toBe(1)
    expect(`${execution.stdout ?? ""}${execution.stderr ?? ""}`).toContain(
      "IMAGE_RUNNER"
    )
  })
})
