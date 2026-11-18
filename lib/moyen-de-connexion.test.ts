import { describe, expect, it } from "vitest"

import {
  DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES,
  NOM_COOKIE_MOYEN_DE_CONNEXION,
  analyserValeurMoyenDeConnexion,
  moyenDeConnexionAffichable,
  moyensDeConnexionOfferts,
  phraseDerniereConnexion,
  resoudreMoyenDeConnexion,
} from "./moyen-de-connexion"

describe("le Moyen de connexion", () => {
  it("porte le nom du cookie de la boutique et sa durée de trente jours", () => {
    expect(NOM_COOKIE_MOYEN_DE_CONNEXION).toBe(
      "eguidar.dernier-moyen-de-connexion"
    )
    expect(DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES).toBe(2_592_000)
  })

  it("résout les trois chemins dont la boutique est propriétaire", () => {
    expect(resoudreMoyenDeConnexion("/sign-in/email")).toBe("mot-de-passe")
    expect(resoudreMoyenDeConnexion("/callback/google")).toBe("google")
    expect(resoudreMoyenDeConnexion("/callback/facebook")).toBe("facebook")
  })

  it("rend une chaîne vide pour tout chemin qui n'est pas une Connexion retenue", () => {
    for (const chemin of [
      "",
      "/sign-in/email-otp",
      "/sign-up/email",
      "/callback/email",
      "/callback/passkey",
      "/one-tap/callback",
      "/magic-link/verify",
      "/",
    ]) {
      expect(resoudreMoyenDeConnexion(chemin)).toBe("")
    }
  })

  it("ne lit que le vocabulaire de la boutique dans la valeur du cookie", () => {
    expect(analyserValeurMoyenDeConnexion("mot-de-passe")).toBe("mot-de-passe")
    expect(analyserValeurMoyenDeConnexion("google")).toBe("google")
    expect(analyserValeurMoyenDeConnexion("facebook")).toBe("facebook")
  })

  it("rejette les identifiants de la bibliothèque et les valeurs inconnues", () => {
    for (const valeur of [
      "email",
      "email-otp",
      "passkey",
      "magic-link",
      "Google",
      "",
      null,
      undefined,
    ]) {
      expect(analyserValeurMoyenDeConnexion(valeur)).toBeNull()
    }
  })

  it("n'offre que le mot de passe quand aucun fournisseur social n'est configuré", () => {
    expect(
      moyensDeConnexionOfferts({ hasGoogle: false, hasFacebook: false })
    ).toEqual(["mot-de-passe"])
  })

  it("offre les méthodes sociales configurées en plus du mot de passe", () => {
    expect(
      moyensDeConnexionOfferts({ hasGoogle: true, hasFacebook: true })
    ).toEqual(["mot-de-passe", "google", "facebook"])
  })

  it("n'affiche le Moyen de connexion que s'il est offert et qu'il y en a au moins deux", () => {
    const offerts = moyensDeConnexionOfferts({
      hasGoogle: true,
      hasFacebook: true,
    })
    expect(moyenDeConnexionAffichable("google", offerts)).toBe("google")
    expect(moyenDeConnexionAffichable("facebook", offerts)).toBe("facebook")
    expect(moyenDeConnexionAffichable("mot-de-passe", offerts)).toBe(
      "mot-de-passe"
    )
  })

  it("n'affiche rien pour une méthode retirée, un seul moyen offert ou une valeur illisible", () => {
    const offerts = moyensDeConnexionOfferts({
      hasGoogle: true,
      hasFacebook: false,
    })
    expect(moyenDeConnexionAffichable("facebook", offerts)).toBeNull()
    expect(
      moyenDeConnexionAffichable(
        "mot-de-passe",
        moyensDeConnexionOfferts({ hasGoogle: false, hasFacebook: false })
      )
    ).toBeNull()
    expect(moyenDeConnexionAffichable("email", offerts)).toBeNull()
    expect(moyenDeConnexionAffichable(null, offerts)).toBeNull()
  })

  it("écrit une phrase avec le libellé français de chaque moyen", () => {
    expect(phraseDerniereConnexion("google")).toBe(
      "Dernière connexion sur cet appareil : Google."
    )
    expect(phraseDerniereConnexion("facebook")).toBe(
      "Dernière connexion sur cet appareil : Facebook."
    )
    expect(phraseDerniereConnexion("mot-de-passe")).toBe(
      "Dernière connexion sur cet appareil : e-mail et mot de passe."
    )
  })
})
