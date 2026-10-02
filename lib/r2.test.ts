import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const {
  sendMock,
  signedUrlMock,
  putCommandInputs,
  copyCommandInputs,
  deleteCommandInputs,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  signedUrlMock: vi.fn(),
  putCommandInputs: [] as unknown[],
  copyCommandInputs: [] as unknown[],
  deleteCommandInputs: [] as unknown[],
}))

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(command: unknown) {
      return sendMock(command)
    }
  }

  class MockPutObjectCommand {
    readonly input: unknown
    constructor(input: unknown) {
      this.input = input
      putCommandInputs.push(input)
    }
  }

  class MockCopyObjectCommand {
    readonly input: unknown
    constructor(input: unknown) {
      this.input = input
      copyCommandInputs.push(input)
    }
  }

  class MockDeleteObjectCommand {
    readonly input: unknown
    constructor(input: unknown) {
      this.input = input
      deleteCommandInputs.push(input)
    }
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    CopyObjectCommand: MockCopyObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
  }
})

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: signedUrlMock,
}))

import {
  DRAFT_PRODUCTS_PREFIX,
  DUREE_VIE_URL_ENVOI_PRESIGNEE_S,
  MAX_UPLOAD_SIZE,
  PRODUCTS_PREFIX,
  draftObjectKey,
  objectKeyFromPublicUrl,
  persistentObjectKey,
  publicUrlFromKey,
  stockageImageProduitR2,
} from "@/lib/r2"

const ENV_R2 = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const

const envInitial = new Map(ENV_R2.map((key) => [key, process.env[key]]))

afterAll(() => {
  for (const key of ENV_R2) {
    const value = envInitial.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(() => {
  for (const key of ENV_R2) delete process.env[key]
  process.env.R2_ACCOUNT_ID = "account"
  process.env.R2_ACCESS_KEY_ID = "access"
  process.env.R2_SECRET_ACCESS_KEY = "secret"
  process.env.R2_BUCKET = "bucket"
  process.env.R2_PUBLIC_URL = "https://cdn.example.test/"
  ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
  sendMock.mockReset()
  signedUrlMock.mockReset()
  putCommandInputs.length = 0
  copyCommandInputs.length = 0
  deleteCommandInputs.length = 0
  sendMock.mockResolvedValue(undefined)
  signedUrlMock.mockResolvedValue("https://upload.example.test/signed")
})

describe("adaptateur R2 des Images produit", () => {
  it("réserve le préfixe des Brouillons et ne le confond jamais avec une Image persistée", () => {
    expect(PRODUCTS_PREFIX).toBe("products/")
    expect(DRAFT_PRODUCTS_PREFIX).toBe("products/brouillons/")
    expect(draftObjectKey("draft-1", "image/png")).toBe(
      "products/brouillons/draft-1.png"
    )
    expect(persistentObjectKey("draft-1", "image/png")).toBe(
      "products/draft-1.png"
    )
    expect(() =>
      persistentObjectKey("brouillons/draft-1", "image/png")
    ).toThrow("Identifiant d'image invalide")
  })

  it("génère l'URL publique et dérive la clé depuis cette URL", () => {
    const key = "products/image-1.webp"
    const url = publicUrlFromKey(key, "https://cdn.example.test/")

    expect(url).toBe("https://cdn.example.test/products/image-1.webp")
    expect(objectKeyFromPublicUrl(url!, "https://cdn.example.test")).toBe(key)
    expect(
      objectKeyFromPublicUrl(
        "https://cdn.example.test/products/image%20with%20space.webp",
        "https://cdn.example.test"
      )
    ).toBe("products/image with space.webp")
    expect(
      objectKeyFromPublicUrl(
        "https://other.example.test/products/image-1.webp",
        "https://cdn.example.test"
      )
    ).toBeNull()
  })

  it("pré-signe un Brouillon dans son namespace et ne renvoie pas sa clé", async () => {
    const resultat = await stockageImageProduitR2.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/jpeg",
      size: 42,
    })

    expect(resultat).toEqual({
      ok: true,
      valeur: {
        uploadUrl: "https://upload.example.test/signed",
        previewUrl: "https://cdn.example.test/products/brouillons/draft-1.jpg",
      },
    })
    expect(putCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.jpg",
      ContentType: "image/jpeg",
      ContentLength: 42,
    })
    expect(JSON.stringify(resultat)).not.toContain("Key")
    expect(resultat.ok).toBe(true)
  })

  it("pré-signe pour la durée de vie exportée, seule durée que la rétention doit surpasser", async () => {
    // La constante n'est utile que si elle est celle que l'appelant reçoit
    // réellement : la comparaison avec la rétention, vérifiée dans
    // `lib/cycle-vie-image-produit-retention.test.ts`, ne vaudrait rien si
    // l'adaptateur pouvait en garder une autre.
    await stockageImageProduitR2.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/jpeg",
      size: 42,
    })

    expect(signedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: DUREE_VIE_URL_ENVOI_PRESIGNEE_S }
    )
  })

  it("promouvoit un Brouillon vers une clé persistante dérivée du même identifiant", async () => {
    const resultat = await stockageImageProduitR2.promouvoirBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    expect(resultat).toEqual({
      ok: true,
      valeur: {
        publicUrl: "https://cdn.example.test/products/draft-1.png",
      },
    })
    expect(copyCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/draft-1.png",
      CopySource: encodeURIComponent("bucket/products/brouillons/draft-1.png"),
    })
  })

  it("supprime un Brouillon et une Image persistée sans exposer de clé au client", async () => {
    const brouillon = await stockageImageProduitR2.supprimerBrouillon({
      draftId: "draft-1",
      contentType: "image/gif",
    })
    const persistee = await stockageImageProduitR2.supprimerImagePersistee(
      "https://cdn.example.test/products/image-1.gif"
    )

    expect(brouillon).toEqual({ ok: true, valeur: null })
    expect(persistee).toEqual({ ok: true, valeur: null })
    expect(deleteCommandInputs[0]).toMatchObject({
      Key: "products/brouillons/draft-1.gif",
    })
    expect(deleteCommandInputs[1]).toMatchObject({
      Key: "products/image-1.gif",
    })
    const brouillonParUrl =
      await stockageImageProduitR2.supprimerImagePersistee(
        "https://cdn.example.test/products/brouillons/image-1.gif"
      )
    expect(brouillonParUrl).toMatchObject({
      ok: false,
      erreur: { code: "parametre-invalide" },
    })
    expect(deleteCommandInputs).toHaveLength(2)
  })

  it("traduit une panne R2 et une configuration absente en résultats explicites", async () => {
    sendMock.mockRejectedValueOnce(new Error("secret AWS failure"))

    const erreurPromotion = await stockageImageProduitR2.promouvoirBrouillon({
      draftId: "draft-1",
      contentType: "image/avif",
    })
    expect(erreurPromotion).toEqual({
      ok: false,
      erreur: {
        code: "erreur-stockage",
        message: "Échec de l'opération de stockage Cloudflare R2",
      },
    })

    for (const key of ENV_R2) delete process.env[key]
    const nonConfigure = await stockageImageProduitR2.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/avif",
      size: 1,
    })
    expect(nonConfigure).toMatchObject({
      ok: false,
      erreur: { code: "non-configure" },
    })
  })

  it("répond le même refus sur les six opérations quand le stockage est mort", async () => {
    // Une seule façon d'échouer, pour les six opérations du port. Les quatre
    // opérations de Brouillon répondaient déjà ; les deux suppressions par URL
    // laissaient remonter l'exception et donnaient donc une seconde réponse au
    // même incident. Épingler les six ensemble est ce qui empêche la
    // divergence de revenir opération par opération.
    sendMock.mockRejectedValue(new Error("secret AWS failure"))
    signedUrlMock.mockRejectedValue(new Error("secret AWS failure"))

    const resultats = [
      await stockageImageProduitR2.presignerBrouillon({
        draftId: "draft-1",
        contentType: "image/png",
        size: 42,
      }),
      await stockageImageProduitR2.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/png",
      }),
      await stockageImageProduitR2.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/png",
      }),
      await stockageImageProduitR2.supprimerImagePromue({
        draftId: "draft-1",
        contentType: "image/png",
      }),
      await stockageImageProduitR2.supprimerImagePersistee(
        "https://cdn.example.test/products/image-1.png"
      ),
      await stockageImageProduitR2.supprimerImageCategorie(
        "https://cdn.example.test/categories/2026/vintage.jpg"
      ),
    ]

    expect(resultats).toHaveLength(6)
    for (const resultat of resultats) {
      expect(resultat).toEqual({
        ok: false,
        erreur: {
          code: "erreur-stockage",
          message: "Échec de l'opération de stockage Cloudflare R2",
        },
      })
    }
  })

  it("répond un refus sur la suppression d'une Image persistée au lieu de laisser remonter la panne R2", async () => {
    // Les six opérations du port répondent de la même façon à une panne R2.
    // Traduire ne fait pas disparaître la panne : le Catalogue journalise un
    // refus comme il journalisait une exception, et c'est ce qui gardait la
    // suppression best-effort sans jamais faire échouer une mutation engagée.
    sendMock.mockRejectedValueOnce(new Error("secret AWS failure"))

    expect(
      await stockageImageProduitR2.supprimerImagePersistee(
        "https://cdn.example.test/products/image-panne.gif"
      )
    ).toEqual({
      ok: false,
      erreur: {
        code: "erreur-stockage",
        message: "Échec de l'opération de stockage Cloudflare R2",
      },
    })
  })

  it("conserve la limite de taille existante", () => {
    expect(MAX_UPLOAD_SIZE).toBe(10 * 1024 * 1024)
  })

  it("garde les deux suppressions par URL hors de l'espace réservé des Brouillons", async () => {
    // Une Image produit persistée vit sous `products/`, une image de Structure
    // n'importe où sous la base publique : deux opérations, deux gardes. Ni
    // l'une ni l'autre ne doit pouvoir viser l'espace réservé des Brouillons.
    const imagesDeCategorie = [
      "https://cdn.example.test/categories/2026/vintage.jpg",
      "https://cdn.example.test/banners/accueil.png",
      "https://cdn.example.test/products/brouillons/interdits.jpg",
    ]

    for (const url of imagesDeCategorie) {
      const resultat = await stockageImageProduitR2.supprimerImageCategorie(url)
      expect(resultat, url).toMatchObject(
        url.includes("products/brouillons/")
          ? { ok: false, erreur: { code: "parametre-invalide" } }
          : { ok: true, valeur: null }
      )
      expect(
        await stockageImageProduitR2.supprimerImagePersistee(url),
        url
      ).toMatchObject({
        ok: false,
        erreur: { code: "parametre-invalide" },
      })
    }

    expect(
      deleteCommandInputs.map((input) => (input as { Key: string }).Key)
    ).toEqual(["categories/2026/vintage.jpg", "banners/accueil.png"])
  })

  it("répond un refus sur la suppression d'une image de catégorie au lieu de laisser remonter la panne R2", async () => {
    // Même accord que pour l'Image produit persistée : la Structure journalise
    // un refus comme elle journalisait une exception, donc la panne ne devient
    // pas invisible en étant traduite.
    sendMock.mockRejectedValueOnce(new Error("secret AWS failure"))

    expect(
      await stockageImageProduitR2.supprimerImageCategorie(
        "https://cdn.example.test/categories/panne.jpg"
      )
    ).toEqual({
      ok: false,
      erreur: {
        code: "erreur-stockage",
        message: "Échec de l'opération de stockage Cloudflare R2",
      },
    })
  })
})
