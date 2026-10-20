import { describe, expect, it } from "vitest"

import {
  cleImageProduitPersistee,
  estUrlImageProduitPersistee,
} from "@/lib/espace-de-noms-image-produit"

const BASE = "https://cdn.eguidar.com"

describe("l'espace de noms des Images produit", () => {
  it("nomme la clé d'une Image produit persistée sous le CDN de la boutique", () => {
    expect(
      cleImageProduitPersistee(`${BASE}/products/image-1.webp`, BASE)
    ).toBe("products/image-1.webp")
  })

  it("tolère la barre finale de la base publique", () => {
    expect(
      cleImageProduitPersistee(`${BASE}/products/image-1.webp`, `${BASE}/`)
    ).toBe("products/image-1.webp")
  })

  it("refuse un hôte qui n'est pas le CDN de la boutique", () => {
    expect(
      cleImageProduitPersistee(
        "https://ailleurs.example.test/products/image-1.webp",
        BASE
      )
    ).toBeNull()
  })

  it("ne prend pas un hôte dont le nom commence par la base pour le CDN", () => {
    expect(
      cleImageProduitPersistee(
        `${BASE}.ailleurs.example.test/products/image-1.webp`,
        BASE
      )
    ).toBeNull()
  })

  it("refuse une URL sous le CDN mais hors de l'espace des Images produit", () => {
    expect(
      cleImageProduitPersistee(`${BASE}/categories/image-1.webp`, BASE)
    ).toBeNull()
    expect(cleImageProduitPersistee(`${BASE}/`, BASE)).toBeNull()
  })

  it("refuse un Brouillon d'Image produit, même percent-encodé", () => {
    expect(
      cleImageProduitPersistee(
        `${BASE}/products/brouillons/brouillon-1.webp`,
        BASE
      )
    ).toBeNull()
    expect(
      cleImageProduitPersistee(
        `${BASE}/products/brouillons%2Fbrouillon-1.webp`,
        BASE
      )
    ).toBeNull()
  })

  it("refuse un segment de point qui normalise vers un Brouillon", () => {
    expect(
      cleImageProduitPersistee(
        `${BASE}/products/a/../brouillons/brouillon-1.webp`,
        BASE
      )
    ).toBeNull()
    expect(
      cleImageProduitPersistee(
        `${BASE}/products/a/%2e%2e/brouillons/brouillon-1.webp`,
        BASE
      )
    ).toBeNull()
    expect(
      cleImageProduitPersistee(
        `${BASE}/products/a%2F..%2Fbrouillons%2Fbrouillon-1.webp`,
        BASE
      )
    ).toBeNull()
  })

  it("refuse un segment vide ou une barre finale", () => {
    expect(
      cleImageProduitPersistee(`${BASE}/products//image-1.webp`, BASE)
    ).toBeNull()
    expect(
      cleImageProduitPersistee(`${BASE}/products/image-1.webp/`, BASE)
    ).toBeNull()
  })

  it("refuse toute URL quand la base publique est absente", () => {
    expect(
      cleImageProduitPersistee(`${BASE}/products/image-1.webp`, null)
    ).toBeNull()
    expect(
      cleImageProduitPersistee(`${BASE}/products/image-1.webp`, "")
    ).toBeNull()
  })

  it("expose un prédicat booléen qui répond comme la clé", () => {
    expect(
      estUrlImageProduitPersistee(`${BASE}/products/image-1.webp`, BASE)
    ).toBe(true)
    expect(
      estUrlImageProduitPersistee(
        `${BASE}/products/brouillons/brouillon-1.webp`,
        BASE
      )
    ).toBe(false)
  })
})
