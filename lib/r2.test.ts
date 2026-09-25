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
  MAX_UPLOAD_SIZE,
  PRODUCTS_PREFIX,
  deleteR2Object,
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
    expect(
      await deleteR2Object("https://cdn.example.test/products/image-2.gif")
    ).toEqual({ ok: true, valeur: null })
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

  it("conserve la limite de taille existante", () => {
    expect(MAX_UPLOAD_SIZE).toBe(10 * 1024 * 1024)
  })
})
