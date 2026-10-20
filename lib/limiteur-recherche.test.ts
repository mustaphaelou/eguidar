import { describe, expect, it } from "vitest"

import {
  ADRESSE_CLIENT_PARTAGEE,
  adresseClient,
  BUDGET_LIMITEUR_RECHERCHE,
  FENETRE_LIMITEUR_RECHERCHE_MS,
} from "@/lib/limiteur-recherche"
import { creerLimiteurRechercheMemoire } from "@/test/limiteur-recherche-memoire"

describe("Adresse du client de la Recherche", () => {
  it("préfère l'adresse posée par Cloudflare à tout en-tête transmis", () => {
    const entetes = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "192.0.2.1, 10.0.0.1",
    })

    expect(adresseClient(entetes)).toBe("203.0.113.7")
  })

  it("ignore un premier relais forgé quand cf-connecting-ip est présent", () => {
    const entetes = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99, 10.0.0.1",
    })

    expect(adresseClient(entetes)).toBe("203.0.113.7")
  })

  it("préfère x-real-ip à x-forwarded-for, dont le premier relais est forgeable", () => {
    const entetes = new Headers({
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "192.0.2.1, 10.0.0.1",
    })

    expect(adresseClient(entetes)).toBe("198.51.100.4")
  })

  it("retient le dernier relais de x-forwarded-for, celui du proxy le plus proche", () => {
    const entetes = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
    })

    expect(adresseClient(entetes)).toBe("10.0.0.2")
  })

  it("se replie sur x-real-ip quand x-forwarded-for manque ou est vide", () => {
    expect(adresseClient(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4"
    )
    expect(
      adresseClient(
        new Headers({ "x-forwarded-for": " ", "x-real-ip": "198.51.100.4" })
      )
    ).toBe("198.51.100.4")
  })

  it("partage un seul seau quand aucun en-tête ne nomme le client", () => {
    const sansEntete = adresseClient(new Headers())
    const autreSansEntete = adresseClient(
      new Headers({ "user-agent": "un navigateur" })
    )

    expect(sansEntete).toBe(ADRESSE_CLIENT_PARTAGEE)
    expect(autreSansEntete).toBe(sansEntete)
  })
})

describe("Réglages par défaut du limiteur de Recherche", () => {
  it("laisse passer le budget de la constante, puis refuse la requête suivante", async () => {
    const limiteur = creerLimiteurRechercheMemoire()

    const verdicts: string[] = []
    for (let i = 0; i < BUDGET_LIMITEUR_RECHERCHE; i += 1) {
      verdicts.push(await limiteur.consommer("203.0.113.7"))
    }

    expect(verdicts).toEqual(
      Array.from({ length: BUDGET_LIMITEUR_RECHERCHE }, () => "autorise")
    )
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("refuse")
  })

  it("rouvre la fenêtre au bout de la constante", async () => {
    let maintenant = 1_000
    const limiteur = creerLimiteurRechercheMemoire({
      maintenant: () => maintenant,
    })

    for (let i = 0; i < BUDGET_LIMITEUR_RECHERCHE; i += 1) {
      await limiteur.consommer("203.0.113.7")
    }
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("refuse")

    maintenant += FENETRE_LIMITEUR_RECHERCHE_MS - 1
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("refuse")

    maintenant += 1
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("autorise")
  })
})
