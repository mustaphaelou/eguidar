import { describe, expect, it } from "vitest"

import { environnementDeBuild, environnementDuServeur } from "./serveur"

const BASE = "postgresql://eguidar:eguidar@127.0.0.1:5433/eguidar_probe"
const ORIGINE = "http://127.0.0.1:3100"

describe("l'environnement du serveur de la sonde", () => {
  const poste: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    TURNSTILE_SECRET_KEY: "secret-du-poste-qui-ne-doit-pas-fuir",
    BETTER_AUTH_SECRET: "secret-de-session",
    PATH: "/usr/bin",
  }

  it("retire le secret Turnstile : le plugin de Test de sécurité n'est jamais enregistré", () => {
    const environnement = environnementDuServeur(ORIGINE, BASE, null, poste)

    expect(environnement).not.toHaveProperty("TURNSTILE_SECRET_KEY")
    expect(environnement.DATABASE_URL).toBe(BASE)
    expect(environnement.BETTER_AUTH_URL).toBe(ORIGINE)
    expect(environnement.BETTER_AUTH_SECRET).toBe("secret-de-session")
  })

  it("le build de la sonde retire le secret de la même façon", () => {
    const environnement = environnementDeBuild(BASE, ORIGINE, null, poste)

    expect(environnement).not.toHaveProperty("TURNSTILE_SECRET_KEY")
    expect(environnement.DATABASE_URL).toBe(BASE)
  })
})
