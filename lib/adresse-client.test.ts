import { describe, expect, it } from "vitest"

import { ADRESSE_CLIENT_PARTAGEE, adresseClient } from "@/lib/adresse-client"

describe("Adresse du client", () => {
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

  it("se replie sur l'adresse partagée quand la valeur retenue n'est pas une adresse", () => {
    expect(
      adresseClient(new Headers({ "cf-connecting-ip": "pas-une-adresse" }))
    ).toBe(ADRESSE_CLIENT_PARTAGEE)
    expect(
      adresseClient(
        new Headers({ "x-forwarded-for": "203.0.113.7, pas-une-adresse" })
      )
    ).toBe(ADRESSE_CLIENT_PARTAGEE)
  })

  it("accepte une adresse IPv6", () => {
    expect(
      adresseClient(new Headers({ "cf-connecting-ip": "2001:db8::1" }))
    ).toBe("2001:db8::1")
  })

  it("ignore une valeur non résolue et poursuit l'ordre de préférence", () => {
    const entetes = new Headers({
      "cf-connecting-ip": "pas-une-adresse",
      "x-real-ip": "198.51.100.4",
    })

    expect(adresseClient(entetes)).toBe("198.51.100.4")
  })
})
