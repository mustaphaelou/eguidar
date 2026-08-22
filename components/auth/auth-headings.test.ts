import { describe, expect, it } from "vitest"

import { headingForDestination } from "./auth-headings"

describe("headingForDestination", () => {
  it("returns null without a destination", () => {
    expect(headingForDestination("login", null)).toBeNull()
  })

  it("announces the order for commerce destinations", () => {
    expect(headingForDestination("login", "/produit/tableau-atlas")).toBe(
      "Connectez-vous pour finaliser votre commande"
    )
    expect(headingForDestination("login", "/panier")).toBe(
      "Connectez-vous pour finaliser votre commande"
    )
    expect(headingForDestination("login", "/checkout")).toBe(
      "Connectez-vous pour finaliser votre commande"
    )
    expect(
      headingForDestination("signup", "/produit/tableau-atlas?variante=2")
    ).toBe("Créez votre compte pour finaliser votre commande")
  })

  it("stays generic for other destinations", () => {
    expect(headingForDestination("login", "/compte")).toBe(
      "Connectez-vous pour continuer"
    )
    expect(headingForDestination("login", "/admin")).toBe(
      "Connectez-vous pour continuer"
    )
    expect(headingForDestination("signup", "/compte/commandes")).toBe(
      "Créez votre compte pour continuer"
    )
  })

  it("does not treat prefixes as whole-path matches", () => {
    expect(headingForDestination("login", "/produits-voisins")).toBe(
      "Connectez-vous pour continuer"
    )
  })
})
