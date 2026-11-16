import { describe, expect, it } from "vitest"

import {
  CODES_REFUS_AUTHENTIFICATION,
  MESSAGE_REFUS_AUTHENTIFICATION_GENERIQUE,
  MESSAGES_REFUS_AUTHENTIFICATION,
  codeRefusDepuisStatut,
  estCodeRefusAuthentification,
  estEmailNonVerifie,
  estIdentifiantsInvalides,
  estRefusTestDeSecurite,
  messageRefusAuthentification,
} from "./refus-authentification"

const REFUS_SANS_PRODUCTEUR = [
  "USER_NOT_FOUND",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]

describe("le vocabulaire des Refus d'authentification", () => {
  it("donne une phrase française à chaque code de l'union", () => {
    for (const code of CODES_REFUS_AUTHENTIFICATION) {
      expect(
        MESSAGES_REFUS_AUTHENTIFICATION[code],
        `le code ${code} n'a pas de phrase`
      ).toMatch(/[a-zà-ÿ]/i)
    }
  })

  it("nomme la fuite et demande un autre mot de passe", () => {
    expect(messageRefusAuthentification("PASSWORD_COMPROMISED")).toContain(
      "fuite de données"
    )
    expect(messageRefusAuthentification("PASSWORD_COMPROMISED")).toContain(
      "Choisissez-en un autre"
    )
  })

  it("rend la phrase générique pour un code inconnu ou absent", () => {
    expect(messageRefusAuthentification("CODE_INCONNU")).toBe(
      MESSAGE_REFUS_AUTHENTIFICATION_GENERIQUE
    )
    expect(messageRefusAuthentification(undefined)).toBe(
      MESSAGE_REFUS_AUTHENTIFICATION_GENERIQUE
    )
  })

  it("ne garde pas les codes qu'aucun parcours ne produit", () => {
    for (const code of REFUS_SANS_PRODUCTEUR) {
      expect(estCodeRefusAuthentification(code)).toBe(false)
      expect(messageRefusAuthentification(code)).toBe(
        MESSAGE_REFUS_AUTHENTIFICATION_GENERIQUE
      )
    }
  })

  it("traduit un statut de transport en code de refus", () => {
    expect(codeRefusDepuisStatut(429)).toBe("TOO_MANY_ATTEMPTS")
    expect(codeRefusDepuisStatut(400)).toBeUndefined()
    expect(codeRefusDepuisStatut(401)).toBeUndefined()
    expect(codeRefusDepuisStatut(undefined)).toBeUndefined()
  })

  it("reconnaît les refus que les flux distinguent", () => {
    expect(estEmailNonVerifie("EMAIL_NOT_VERIFIED")).toBe(true)
    expect(estEmailNonVerifie("INVALID_EMAIL_OR_PASSWORD")).toBe(false)
    expect(estEmailNonVerifie(undefined)).toBe(false)

    expect(estIdentifiantsInvalides("INVALID_EMAIL_OR_PASSWORD")).toBe(true)
    expect(estIdentifiantsInvalides("EMAIL_NOT_VERIFIED")).toBe(false)

    expect(estRefusTestDeSecurite("VERIFICATION_FAILED")).toBe(true)
    expect(estRefusTestDeSecurite("MISSING_RESPONSE")).toBe(false)
    expect(estRefusTestDeSecurite("UNKNOWN_ERROR")).toBe(false)
    expect(estRefusTestDeSecurite(undefined)).toBe(false)
  })
})
