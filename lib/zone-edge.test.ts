import { describe, expect, it } from "vitest"

import { site } from "@/lib/site"

import { HOTE_EDGE, urlEdge } from "./zone-edge"

describe("la zone de l'edge", () => {
  it("nomme l'hôte de la boutique, sans seconde écriture du domaine", () => {
    expect(HOTE_EDGE).toBe(new URL(site.url).hostname)
  })

  it("préfixe un chemin absolu par l'hôte de la boutique", () => {
    expect(urlEdge("/produit/mon-produit")).toBe(
      `${site.url}/produit/mon-produit`
    )
  })

  it("ajoute la barre oblique manquante plutôt que de remplacer le dernier segment", () => {
    expect(urlEdge("panier")).toBe(`${site.url}/panier`)
  })
})
