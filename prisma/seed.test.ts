import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")

const BASE_INJOIGNABLE =
  "postgresql://personne:personne@127.0.0.1:1/aucune-base"

function lancerLeSeed(env: Record<string, string>): {
  code: number | null
  sortie: string
} {
  const resultat = spawnSync(
    process.execPath,
    ["--import", "tsx", "prisma/seed.ts"],
    {
      cwd: RACINE,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: BASE_INJOIGNABLE, ...env },
      timeout: 30_000,
    }
  )

  return {
    code: resultat.status,
    sortie: `${resultat.stdout ?? ""}${resultat.stderr ?? ""}`,
  }
}

describe("prisma/seed.ts — compte admin", () => {
  it.each([
    [
      "le mot de passe est absent",
      "ADMIN_PASSWORD",
      { ADMIN_EMAIL: "admin@exemple.test", ADMIN_PASSWORD: "" },
    ],
    [
      "l'adresse e-mail est absente",
      "ADMIN_EMAIL",
      { ADMIN_EMAIL: "", ADMIN_PASSWORD: "secret-du-seed" },
    ],
    [
      "l'adresse e-mail est blanche",
      "ADMIN_EMAIL",
      { ADMIN_EMAIL: "   ", ADMIN_PASSWORD: "secret-du-seed" },
    ],
  ])("refuse quand %s", (_cas, variable, env) => {
    const { code, sortie } = lancerLeSeed(env)

    expect(code).toBe(1)
    expect(sortie).toContain(variable)
    expect(sortie).toContain("refuse")
    expect(sortie).not.toContain("Seed terminé")
    expect(sortie).not.toContain("PrismaClientKnownRequestError")
  })

  it("ne garde aucune valeur de repli pour les identifiants admin", () => {
    const source = readFileSync(path.join(RACINE, "prisma/seed.ts"), "utf8")

    expect(source).not.toContain("admin@eguidar.com")
    expect(source).not.toContain("admin-password-change-me")
  })
})
