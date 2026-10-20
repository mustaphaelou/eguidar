import { describe, expect, it } from "vitest"

import { identifiantsCompteAdmin } from "./compte-admin"

describe("identifiantsCompteAdmin", () => {
  it("refuse un mot de passe absent", () => {
    expect(() =>
      identifiantsCompteAdmin({ ADMIN_EMAIL: "admin@exemple.test" })
    ).toThrow(/ADMIN_PASSWORD/)
  })

  it("refuse une adresse e-mail absente", () => {
    expect(() =>
      identifiantsCompteAdmin({ ADMIN_PASSWORD: "secret-du-seed" })
    ).toThrow(/ADMIN_EMAIL/)
  })

  it("refuse une adresse e-mail blanche", () => {
    for (const email of ["", "   ", "\t"]) {
      expect(() =>
        identifiantsCompteAdmin({
          ADMIN_EMAIL: email,
          ADMIN_PASSWORD: "secret-du-seed",
        })
      ).toThrow(/ADMIN_EMAIL/)
    }
  })

  it("refuse un mot de passe blanc", () => {
    expect(() =>
      identifiantsCompteAdmin({
        ADMIN_EMAIL: "admin@exemple.test",
        ADMIN_PASSWORD: "   ",
      })
    ).toThrow(/ADMIN_PASSWORD/)
  })

  it("nomme les deux variables quand les deux manquent", () => {
    expect(() => identifiantsCompteAdmin({})).toThrow(
      /ADMIN_EMAIL ni ADMIN_PASSWORD/
    )
  })

  it("rend les identifiants fournis quand les deux variables sont renseignées", () => {
    expect(
      identifiantsCompteAdmin({
        ADMIN_EMAIL: "chef@exemple.test",
        ADMIN_PASSWORD: "mot-de-passe-explicite",
      })
    ).toEqual({
      email: "chef@exemple.test",
      motDePasse: "mot-de-passe-explicite",
    })
  })
})
