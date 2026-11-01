import { describe, expect, it } from "vitest"

import {
  POINTS_ENTREE_CONNEXION,
  estPointEntreeConnexion,
} from "./points-entree-connexion"

describe("points d'entrée de la connexion", () => {
  it("déclare exactement les quatre chemins de la règle", () => {
    expect(POINTS_ENTREE_CONNEXION).toEqual([
      { methode: "POST", chemin: "/api/auth/sign-in/email" },
      { methode: "GET", chemin: "/api/auth/callback/", prefixe: true },
      { methode: "POST", chemin: "/api/auth/sign-in/email-otp" },
      { methode: "POST", chemin: "/api/auth/email-otp/verify-email" },
    ])
  })

  it("reconnaît les quatre points d'entrée déclarés", () => {
    expect(estPointEntreeConnexion("POST", "/api/auth/sign-in/email")).toBe(
      true
    )
    expect(estPointEntreeConnexion("GET", "/api/auth/callback/google")).toBe(
      true
    )
    expect(estPointEntreeConnexion("POST", "/api/auth/sign-in/email-otp")).toBe(
      true
    )
    expect(
      estPointEntreeConnexion("POST", "/api/auth/email-otp/verify-email")
    ).toBe(true)
  })

  it("refuse un chemin qui n'est pas une connexion", () => {
    expect(estPointEntreeConnexion("GET", "/api/auth/get-session")).toBe(false)
    expect(
      estPointEntreeConnexion("POST", "/api/auth/email-otp/verify-emailx")
    ).toBe(false)
    expect(estPointEntreeConnexion("GET", "/api/auth/sign-in/email")).toBe(
      false
    )
    expect(estPointEntreeConnexion("POST", "/api/auth/callback/google")).toBe(
      false
    )
    expect(estPointEntreeConnexion("GET", "/api/auth/x/callback/google")).toBe(
      false
    )
  })
})
