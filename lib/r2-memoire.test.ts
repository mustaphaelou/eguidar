import { describe, expect, it } from "vitest"

import { draftObjectKey } from "@/lib/r2"
import { MESSAGE_IMAGE_ILLISIBLE } from "@/lib/verification-image-produit"
import {
  creerStockageImageProduitMemoire,
  type OperationStockage,
  type StockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

describe("adaptateur en mémoire du stockage des Images produit", () => {
  it("pré-signe un Brouillon sous la clé dérivée, et non sous une URL fabriquée", async () => {
    const stockage = creerStockageImageProduitMemoire()

    const resultat = await stockage.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/webp",
      size: 2048,
    })

    expect(resultat).toEqual({
      ok: true,
      valeur: {
        uploadUrl:
          "https://upload.example.test/products/brouillons/draft-1.webp",
        previewUrl: "https://cdn.example.test/products/brouillons/draft-1.webp",
      },
    })
    expect(stockage.presignatures).toEqual([
      {
        draftId: "draft-1",
        contentType: "image/webp",
        size: 2048,
        cle: "products/brouillons/draft-1.webp",
      },
    ])
  })

  it("promouvoit un Brouillon vers la clé persistante, et dit les deux clés qu'elle a visées", async () => {
    const stockage = creerStockageImageProduitMemoire()

    const resultat = await stockage.promouvoirBrouillon({
      draftId: "draft-1",
      contentType: "image/webp",
    })

    expect(resultat).toEqual({
      ok: true,
      valeur: { publicUrl: "https://cdn.example.test/products/draft-1.webp" },
    })
    expect(stockage.promotions).toEqual([
      {
        draftId: "draft-1",
        cleSource: "products/brouillons/draft-1.webp",
        cle: "products/draft-1.webp",
        publicUrl: "https://cdn.example.test/products/draft-1.webp",
      },
    ])
  })

  it("supprime un Brouillon sous sa clé, sous l'espace réservé, et non sous son identifiant", async () => {
    const stockage = creerStockageImageProduitMemoire()

    expect(
      await stockage.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).toEqual({ ok: true, valeur: null })
    expect(stockage.suppressionsBrouillons).toEqual([
      "products/brouillons/draft-1.webp",
    ])
  })

  it("supprime une Image promue sous la clé persistante, distincte de celle du Brouillon", async () => {
    const stockage = creerStockageImageProduitMemoire()

    expect(
      await stockage.supprimerImagePromue({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).toEqual({ ok: true, valeur: null })
    expect(stockage.suppressionsImagesPromues).toEqual([
      "products/draft-1.webp",
    ])
  })

  it("relit dans les deux suppressions par URL la clé que l'URL publique nomme", async () => {
    const stockage = creerStockageImageProduitMemoire()

    expect(
      await stockage.supprimerImagePersistee(
        "https://cdn.example.test/products/image-1.webp"
      )
    ).toEqual({ ok: true, valeur: null })
    expect(
      await stockage.supprimerImageCategorie(
        "https://cdn.example.test/categories/2026/vintage.jpg"
      )
    ).toEqual({ ok: true, valeur: null })

    expect(stockage.suppressionsImagesPersistees).toEqual([
      "products/image-1.webp",
    ])
    expect(stockage.suppressionsImagesCategorie).toEqual([
      "categories/2026/vintage.jpg",
    ])
  })

  it("ne vise rien quand une adresse ne mène à aucune clé", async () => {
    const stockage = creerStockageImageProduitMemoire()
    const brouillonAbandonne =
      "https://cdn.example.test/products/brouillons/abandonne.webp"

    for (const url of [
      brouillonAbandonne,
      "https://cdn.example.test/categories/2026/vintage.jpg",
      "https://autre.example.test/products/image-1.webp",
    ]) {
      await stockage.supprimerImagePersistee(url)
    }
    await stockage.supprimerImageCategorie(brouillonAbandonne)

    expect(stockage.suppressionsImagesPersistees).toEqual([])
    expect(stockage.suppressionsImagesCategorie).toEqual([])
  })

  it("sait répondre chacun des trois codes du port, sur chacune des six opérations", async () => {
    const operations = [
      [
        "presignerBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.presignerBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
            size: 2048,
          }),
      ],
      [
        "supprimerBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.supprimerBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "promouvoirBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.promouvoirBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "verifierBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.verifierBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "supprimerImagePromue",
        (s: StockageImageProduitMemoire) =>
          s.supprimerImagePromue({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "supprimerImagePersistee",
        (s: StockageImageProduitMemoire) =>
          s.supprimerImagePersistee(
            "https://cdn.example.test/products/image-1.webp"
          ),
      ],
      [
        "supprimerImageCategorie",
        (s: StockageImageProduitMemoire) =>
          s.supprimerImageCategorie(
            "https://cdn.example.test/categories/vintage.jpg"
          ),
      ],
    ] as const satisfies readonly [
      OperationStockage,
      (s: StockageImageProduitMemoire) => Promise<unknown>,
    ][]
    const codes = [
      "non-configure",
      "parametre-invalide",
      "erreur-stockage",
    ] as const

    for (const [operation, appeler] of operations) {
      for (const code of Object.values(codes)) {
        const stockage = creerStockageImageProduitMemoire()
        stockage.pannes[operation].add(code)
        expect(await appeler(stockage), `${operation}/${code}`).toMatchObject({
          ok: false,
          erreur: { code },
        })
      }
      expect(
        await appeler(creerStockageImageProduitMemoire()),
        operation
      ).toMatchObject({
        ok: true,
      })
    }
  })

  it("vérifie un Brouillon : des faits synthétiques par défaut, un refus sur des octets réels invalides", async () => {
    const stockage = creerStockageImageProduitMemoire()
    await expect(
      stockage.verifierBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).resolves.toEqual({
      ok: true,
      valeur: {
        mimeType: "image/webp",
        byteSize: 1024,
        width: 640,
        height: 480,
      },
    })
    expect(stockage.verifications).toHaveLength(1)

    stockage.contenus.set(
      draftObjectKey("draft-1", "image/webp"),
      Buffer.from("Ceci n'est pas une image.")
    )
    await expect(
      stockage.verifierBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).resolves.toEqual({
      ok: false,
      erreur: { code: "contenu-refuse", message: MESSAGE_IMAGE_ILLISIBLE },
    })
  })

  it("lève là où les trois indicateurs ne savent que répondre", async () => {
    const stockage = creerStockageImageProduitMemoire()
    stockage.pannes.promouvoirBrouillon.add("leve")

    await expect(
      stockage.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).rejects.toThrow("Stockage en mémoire indisponible : promouvoirBrouillon")

    const brouillard = creerStockageImageProduitMemoire()
    brouillard.failPresign = true
    brouillard.failPromotion = true
    brouillard.failDelete = true
    for (const resultat of [
      await brouillard.presignerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
        size: 2048,
      }),
      await brouillard.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      }),
      await brouillard.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      }),
    ]) {
      expect(resultat).toMatchObject({
        ok: false,
        erreur: { code: "erreur-stockage" },
      })
    }
  })
})
