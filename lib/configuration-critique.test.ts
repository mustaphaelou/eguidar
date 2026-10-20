import { describe, expect, it } from "vitest"

import {
  avertirConfigurationCritiqueManquante,
  variablesCritiquesManquantes,
} from "./configuration-critique"

const EN_PRODUCTION = { NODE_ENV: "production" }

function capturerLesAvertissements() {
  const messages: string[] = []
  return {
    messages,
    avertir: (message: string) => messages.push(message),
  }
}

describe("variablesCritiquesManquantes", () => {
  it("nomme les variables critiques absentes", () => {
    expect(variablesCritiquesManquantes({})).toEqual([
      "RESEND_API_KEY",
      "TURNSTILE_SECRET_KEY",
    ])
  })

  it("ne nomme que les variables critiques absentes", () => {
    expect(
      variablesCritiquesManquantes({
        RESEND_API_KEY: "re_cle_de_test",
        TURNSTILE_SECRET_KEY: "",
      })
    ).toEqual(["TURNSTILE_SECRET_KEY"])
  })

  it("traite une valeur blanche comme absente", () => {
    expect(
      variablesCritiquesManquantes({
        RESEND_API_KEY: "   ",
        TURNSTILE_SECRET_KEY: "\t",
      })
    ).toEqual(["RESEND_API_KEY", "TURNSTILE_SECRET_KEY"])
  })

  it("ne nomme rien quand tout est renseigné", () => {
    expect(
      variablesCritiquesManquantes({
        RESEND_API_KEY: "re_cle_de_test",
        TURNSTILE_SECRET_KEY: "cle_turnstile_de_test",
      })
    ).toEqual([])
  })
})

describe("avertirConfigurationCritiqueManquante", () => {
  it("avertit une fois en production et nomme les variables absentes", () => {
    const { messages, avertir } = capturerLesAvertissements()

    avertirConfigurationCritiqueManquante(
      {
        ...EN_PRODUCTION,
        TURNSTILE_SECRET_KEY: "cle_turnstile_de_test",
      },
      avertir
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("RESEND_API_KEY")
    expect(messages[0]).not.toContain("TURNSTILE_SECRET_KEY")
  })

  it("nomme les deux variables dans un seul avertissement quand les deux manquent", () => {
    const { messages, avertir } = capturerLesAvertissements()

    avertirConfigurationCritiqueManquante({ ...EN_PRODUCTION }, avertir)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("RESEND_API_KEY")
    expect(messages[0]).toContain("TURNSTILE_SECRET_KEY")
  })

  it("n'expose jamais la valeur d'une variable", () => {
    const { messages, avertir } = capturerLesAvertissements()

    avertirConfigurationCritiqueManquante(
      {
        ...EN_PRODUCTION,
        RESEND_API_KEY: "re_valeur_qui_ne_doit_pas_fuir",
      },
      avertir
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain("TURNSTILE_SECRET_KEY")
    expect(messages[0]).not.toContain("re_valeur_qui_ne_doit_pas_fuir")
  })

  it("reste silencieux en développement", () => {
    const { messages, avertir } = capturerLesAvertissements()

    avertirConfigurationCritiqueManquante({ NODE_ENV: "development" }, avertir)

    expect(messages).toEqual([])
  })

  it("reste silencieux quand tout est renseigné", () => {
    const { messages, avertir } = capturerLesAvertissements()

    avertirConfigurationCritiqueManquante(
      {
        ...EN_PRODUCTION,
        RESEND_API_KEY: "re_cle_de_test",
        TURNSTILE_SECRET_KEY: "cle_turnstile_de_test",
      },
      avertir
    )

    expect(messages).toEqual([])
  })

  it("reste silencieux pendant la fabrication du build", () => {
    const { messages, avertir } = capturerLesAvertissements()

    avertirConfigurationCritiqueManquante(
      { ...EN_PRODUCTION, NEXT_PHASE: "phase-production-build" },
      avertir
    )

    expect(messages).toEqual([])
  })
})
