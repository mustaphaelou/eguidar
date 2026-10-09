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
  DUREE_VIE_URL_ENVOI_PRESIGNEE_S,
  MAX_UPLOAD_SIZE,
  objectKeyFromPublicUrl,
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

  it("pré-signe un Brouillon et ne renvoie pas sa clé", async () => {
    const resultat = await stockageImageProduitR2.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/jpeg",
      size: 42,
    })

    expect(putCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.jpg",
      ContentType: "image/jpeg",
      ContentLength: 42,
    })
    expect(resultat).toMatchObject({
      ok: true,
      valeur: { uploadUrl: "https://upload.example.test/signed" },
    })
    expect(JSON.stringify(resultat)).not.toContain("Key")
  })

  it("pré-signe pour la durée de vie exportée, seule durée que la rétention doit surpasser", async () => {
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

  it("promouvoit en copiant la source vers la destination, et n'en rend que l'adresse", async () => {
    await stockageImageProduitR2.promouvoirBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    expect(copyCommandInputs).toHaveLength(1)
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
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.gif",
    })
    expect(deleteCommandInputs[1]).toMatchObject({
      Bucket: "bucket",
      Key: "products/image-1.gif",
    })
    expect(deleteCommandInputs).toHaveLength(2)
  })

  it("compose le message d'échec que le contrat ne compare pas", async () => {
    sendMock.mockRejectedValue(new Error("secret AWS failure"))

    expect(
      await stockageImageProduitR2.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/avif",
      })
    ).toMatchObject({
      erreur: { message: "Échec de l'opération de stockage Cloudflare R2" },
    })

    for (const key of ENV_R2) delete process.env[key]
    expect(
      await stockageImageProduitR2.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/avif",
      })
    ).toMatchObject({
      erreur: { message: "Stockage Cloudflare R2 non configuré" },
    })
  })

  it("conserve la limite de taille existante", () => {
    expect(MAX_UPLOAD_SIZE).toBe(10 * 1024 * 1024)
  })

  it("n'envoie au bucket que la clé d'une adresse acceptée, et rien pour une adresse refusée", async () => {
    for (const url of [
      "https://cdn.example.test/categories/2026/vintage.jpg",
      "https://cdn.example.test/banners/accueil.png",
      "https://cdn.example.test/products/brouillons/interdits.jpg",
    ]) {
      await stockageImageProduitR2.supprimerImageCategorie(url)
    }

    expect(
      deleteCommandInputs.map((input) => (input as { Key: string }).Key)
    ).toEqual(["categories/2026/vintage.jpg", "banners/accueil.png"])
  })
})
