import sharp from "sharp"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const { sendMock, headCommandInputs, getCommandInputs, putCommandInputs } =
  vi.hoisted(() => ({
    sendMock: vi.fn(),
    headCommandInputs: [] as unknown[],
    getCommandInputs: [] as unknown[],
    putCommandInputs: [] as unknown[],
  }))

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(command: unknown) {
      return sendMock(command)
    }
  }

  class MockPutObjectCommand {
    constructor(readonly input: unknown) {
      putCommandInputs.push(input)
    }
  }

  class MockHeadObjectCommand {
    constructor(readonly input: unknown) {
      headCommandInputs.push(input)
    }
  }

  class MockGetObjectCommand {
    constructor(readonly input: unknown) {
      getCommandInputs.push(input)
    }
  }

  class MockCopyObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class MockDeleteObjectCommand {
    constructor(readonly input: unknown) {}
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    CopyObjectCommand: MockCopyObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
  }
})

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}))

import { MAX_UPLOAD_SIZE, stockageImageProduitR2 } from "@/lib/r2"
import {
  MESSAGE_FORMAT_NON_AUTORISE,
  MESSAGE_IMAGE_ILLISIBLE,
} from "@/lib/verification-image-produit"

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

interface EnteteObjet {
  contenu: Buffer
  contentType?: string | null
  longueur?: number
}

function brancherLeStockage(entete: EnteteObjet): void {
  sendMock.mockImplementation(async (command: unknown) => {
    const nom = (command as { constructor?: { name?: string } })?.constructor
      ?.name
    if (nom === "MockHeadObjectCommand") {
      return {
        ContentLength: entete.longueur ?? entete.contenu.length,
        ContentType:
          entete.contentType === undefined ? "image/png" : entete.contentType,
      }
    }
    if (nom === "MockGetObjectCommand") {
      return {
        Body: {
          transformToByteArray: async () => new Uint8Array(entete.contenu),
        },
      }
    }
    return undefined
  })
}

async function imagePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: { r: 20, g: 120, b: 220 },
    },
  })
    .png()
    .toBuffer()
}

async function jpegAvecExif(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 2,
      channels: 3,
      background: { r: 20, g: 120, b: 220 },
    },
  })
    .jpeg()
    .withExif({
      IFD0: { Copyright: "eguidar" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "31/1 37/1 0/1",
      },
    })
    .toBuffer()
}

beforeEach(() => {
  for (const key of ENV_R2) delete process.env[key]
  process.env.R2_ACCOUNT_ID = "account"
  process.env.R2_ACCESS_KEY_ID = "access"
  process.env.R2_SECRET_ACCESS_KEY = "secret"
  process.env.R2_BUCKET = "bucket"
  process.env.R2_PUBLIC_URL = "https://cdn.example.test/"
  ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
  sendMock.mockReset()
  headCommandInputs.length = 0
  getCommandInputs.length = 0
  putCommandInputs.length = 0
})

describe("vérification d'un Brouillon avant promotion", () => {
  it("lit l'objet réel, décode ses octets et réécrit le Brouillon sans EXIF", async () => {
    const source = await jpegAvecExif()
    brancherLeStockage({ contenu: source, contentType: "image/jpeg" })

    const resultat = await stockageImageProduitR2.verifierBrouillon({
      draftId: "draft-1",
      contentType: "image/jpeg",
    })

    expect(headCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.jpg",
    })
    expect(getCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.jpg",
    })
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.valeur).toMatchObject({
      mimeType: "image/jpeg",
      width: 4,
      height: 2,
    })
    expect(resultat.valeur.byteSize).toBeGreaterThan(0)

    expect(putCommandInputs).toHaveLength(1)
    const envoi = putCommandInputs[0] as {
      Key: string
      Body: Buffer
      ContentType: string
    }
    expect(envoi.Key).toBe("products/brouillons/draft-1.jpg")
    expect(envoi.ContentType).toBe("image/jpeg")
    expect(Buffer.isBuffer(envoi.Body)).toBe(true)
    expect(envoi.Body.includes(Buffer.from("Exif"))).toBe(false)
    const metadata = await sharp(envoi.Body).metadata()
    expect(metadata.exif).toBeUndefined()
    expect(metadata.width).toBe(4)
    expect(metadata.height).toBe(2)
  })

  it("refuse un objet dont les octets ne décodent pas et ne réécrit rien", async () => {
    brancherLeStockage({
      contenu: Buffer.from("Ceci n'est pas une image."),
      contentType: "image/png",
    })

    const resultat = await stockageImageProduitR2.verifierBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    expect(resultat).toEqual({
      ok: false,
      erreur: { code: "contenu-refuse", message: MESSAGE_IMAGE_ILLISIBLE },
    })
    expect(putCommandInputs).toEqual([])
  })

  it("refuse un objet dont le type stocké n'est pas un type autorisé", async () => {
    brancherLeStockage({
      contenu: await imagePng(),
      contentType: "image/svg+xml",
    })

    const resultat = await stockageImageProduitR2.verifierBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    expect(resultat).toEqual({
      ok: false,
      erreur: { code: "contenu-refuse", message: MESSAGE_FORMAT_NON_AUTORISE },
    })
    expect(getCommandInputs).toEqual([])
    expect(putCommandInputs).toEqual([])
  })

  it("refuse une longueur réelle nulle ou au-delà de la limite", async () => {
    const contenu = await imagePng()
    for (const longueur of [0, MAX_UPLOAD_SIZE + 1]) {
      getCommandInputs.length = 0
      putCommandInputs.length = 0
      brancherLeStockage({ contenu, longueur })
      const resultat = await stockageImageProduitR2.verifierBrouillon({
        draftId: "draft-1",
        contentType: "image/png",
      })
      expect(resultat).toMatchObject({
        ok: false,
        erreur: { code: "parametre-invalide" },
      })
      expect(getCommandInputs).toEqual([])
      expect(putCommandInputs).toEqual([])
    }
  })

  it("répond non configuré sans toucher au réseau", async () => {
    for (const key of ENV_R2) delete process.env[key]

    const resultat = await stockageImageProduitR2.verifierBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    expect(resultat).toMatchObject({
      ok: false,
      erreur: { code: "non-configure" },
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("répond erreur de stockage quand le corps de l'objet est absent", async () => {
    sendMock.mockImplementation(async (command: unknown) => {
      const nom = (command as { constructor?: { name?: string } })?.constructor
        ?.name
      if (nom === "MockHeadObjectCommand") {
        return { ContentLength: 42, ContentType: "image/png" }
      }
      return {}
    })

    const resultat = await stockageImageProduitR2.verifierBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    expect(resultat).toMatchObject({
      ok: false,
      erreur: { code: "erreur-stockage" },
    })
    expect(putCommandInputs).toEqual([])
  })
})
