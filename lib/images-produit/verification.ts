import sharp from "sharp"
import type { Metadata, OutputInfo } from "sharp"

export const FORMATS_IMAGE_PRODUIT = [
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
] as const

export type FormatImageProduit = (typeof FORMATS_IMAGE_PRODUIT)[number]

export const MESSAGE_IMAGE_VIDE = "Le fichier envoyé est vide"

export const MESSAGE_IMAGE_ILLISIBLE =
  "Le fichier envoyé n'est pas une image lisible (JPEG, PNG, WebP, AVIF ou GIF attendu)"

export const MESSAGE_FORMAT_NON_AUTORISE =
  "Le format de l'image n'est pas pris en charge (JPEG, PNG, WebP, AVIF ou GIF attendu)"

export interface ImageProduitInspectee {
  format: FormatImageProduit
  mimeType: string
  width: number
  height: number
  byteSize: number
  /** Les octets réécrits : sans EXIF, orientation appliquée. */
  bytes: Buffer
}

export interface RefusInspectionImageProduit {
  ok: false
  code: "contenu-refuse"
  message: string
}

export type ResultatInspectionImageProduit =
  { ok: true; image: ImageProduitInspectee } | RefusInspectionImageProduit

const MIME_PAR_FORMAT: Record<FormatImageProduit, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
}

function refus(message: string): RefusInspectionImageProduit {
  return { ok: false, code: "contenu-refuse", message }
}

function formatDepuisMetadata(metadata: Metadata): FormatImageProduit | null {
  if (metadata.format === "heif") {
    return metadata.compression === "av1" ? "avif" : null
  }
  return FORMATS_IMAGE_PRODUIT.includes(metadata.format as FormatImageProduit)
    ? (metadata.format as FormatImageProduit)
    : null
}

async function reecrire(
  octets: Buffer,
  format: FormatImageProduit
): Promise<{ data: Buffer; info: OutputInfo }> {
  const source = sharp(octets, {
    animated: format === "gif",
    failOn: "warning",
  }).rotate()
  switch (format) {
    case "jpeg":
      return source.jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true })
    case "png":
      return source
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true })
    case "webp":
      return source.webp({ quality: 90 }).toBuffer({ resolveWithObject: true })
    case "avif":
      return source
        .avif({ quality: 55, effort: 2 })
        .toBuffer({ resolveWithObject: true })
    case "gif":
      return source.gif().toBuffer({ resolveWithObject: true })
  }
}

/**
 * Le décodage fait autorité sur le type déclaré : il rend le format réel, les
 * dimensions réelles et la taille réelle, et réécrit les octets sans métadonnées
 * (EXIF compris). OWASP demande décoder puis réencoder une image téléversée.
 */
export async function inspecterImageProduit(
  octets: Buffer | Uint8Array
): Promise<ResultatInspectionImageProduit> {
  const source = Buffer.isBuffer(octets) ? octets : Buffer.from(octets)
  if (source.length === 0) return refus(MESSAGE_IMAGE_VIDE)

  let metadata: Metadata
  try {
    metadata = await sharp(source, { failOn: "warning" }).metadata()
  } catch {
    return refus(MESSAGE_IMAGE_ILLISIBLE)
  }

  const format = formatDepuisMetadata(metadata)
  if (format === null) return refus(MESSAGE_FORMAT_NON_AUTORISE)

  try {
    const { data, info } = await reecrire(source, format)
    return {
      ok: true,
      image: {
        format,
        mimeType: MIME_PAR_FORMAT[format],
        width: info.width,
        height: info.height,
        byteSize: data.length,
        bytes: data,
      },
    }
  } catch {
    return refus(MESSAGE_IMAGE_ILLISIBLE)
  }
}
