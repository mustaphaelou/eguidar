import sharp from "sharp"
import { describe, expect, it } from "vitest"

import {
  FORMATS_IMAGE_PRODUIT,
  MESSAGE_FORMAT_NON_AUTORISE,
  MESSAGE_IMAGE_ILLISIBLE,
  MESSAGE_IMAGE_VIDE,
  inspecterImageProduit,
  type FormatImageProduit,
} from "@/lib/verification-image-produit"

const DIMENSIONS = { width: 4, height: 2 }

function fond(): sharp.Sharp {
  return sharp({
    create: {
      ...DIMENSIONS,
      channels: 3,
      background: { r: 180, g: 40, b: 60 },
    },
  })
}

async function imageEn(format: FormatImageProduit): Promise<Buffer> {
  switch (format) {
    case "jpeg":
      return fond().jpeg().toBuffer()
    case "png":
      return fond().png().toBuffer()
    case "webp":
      return fond().webp().toBuffer()
    case "avif":
      return fond().avif({ effort: 0 }).toBuffer()
    case "gif":
      return fond().gif().toBuffer()
  }
}

async function imageAvecExifOriente(): Promise<Buffer> {
  return fond()
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Copyright: "eguidar" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "31/1 37/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "8/1 0/1 0/1",
      },
    })
    .toBuffer()
}

describe("inspection des Images produit envoyées", () => {
  it.each(FORMATS_IMAGE_PRODUIT)(
    "accepte un vrai fichier %s et rend ses faits réels",
    async (format) => {
      const octets = await imageEn(format)
      const resultat = await inspecterImageProduit(octets)

      expect(resultat.ok).toBe(true)
      if (!resultat.ok) return
      expect(resultat.image.format).toBe(format)
      expect(resultat.image.mimeType).toBe(
        format === "jpeg" ? "image/jpeg" : `image/${format}`
      )
      expect(resultat.image.width).toBe(DIMENSIONS.width)
      expect(resultat.image.height).toBe(DIMENSIONS.height)
      expect(resultat.image.byteSize).toBe(resultat.image.bytes.length)
      expect(resultat.image.byteSize).toBeGreaterThan(0)
    }
  )

  it("retire l'EXIF, dont le GPS, et applique l'orientation avant de réécrire les octets", async () => {
    const source = await imageAvecExifOriente()
    const metadataSource = await sharp(source).metadata()
    expect(metadataSource.exif).toBeDefined()
    expect(source.includes(Buffer.from("Exif"))).toBe(true)

    const resultat = await inspecterImageProduit(source)

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.image.width).toBe(DIMENSIONS.height)
    expect(resultat.image.height).toBe(DIMENSIONS.width)
    expect(resultat.image.bytes.includes(Buffer.from("Exif"))).toBe(false)
    const metadataSortie = await sharp(resultat.image.bytes).metadata()
    expect(metadataSortie.exif).toBeUndefined()
    expect(metadataSortie.orientation).toBeUndefined()
  })

  it("refuse un fichier renommé qui n'est pas une image", async () => {
    const resultat = await inspecterImageProduit(
      Buffer.from("Ceci n'est pas une image, seulement du texte.")
    )

    expect(resultat).toEqual({
      ok: false,
      code: "contenu-refuse",
      message: MESSAGE_IMAGE_ILLISIBLE,
    })
  })

  it("refuse des octets tronqués qui ne décodent pas", async () => {
    const octets = await imageEn("jpeg")
    const tronques = octets.subarray(0, Math.floor(octets.length / 2))

    const resultat = await inspecterImageProduit(tronques)

    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.code).toBe("contenu-refuse")
    expect(resultat.message).toBe(MESSAGE_IMAGE_ILLISIBLE)
  })

  it("refuse un format lisible mais hors des cinq types autorisés", async () => {
    const tiff = await fond().tiff().toBuffer()

    const resultat = await inspecterImageProduit(tiff)

    expect(resultat).toEqual({
      ok: false,
      code: "contenu-refuse",
      message: MESSAGE_FORMAT_NON_AUTORISE,
    })
  })

  it("refuse un fichier vide", async () => {
    const resultat = await inspecterImageProduit(Buffer.alloc(0))

    expect(resultat).toEqual({
      ok: false,
      code: "contenu-refuse",
      message: MESSAGE_IMAGE_VIDE,
    })
  })
})
