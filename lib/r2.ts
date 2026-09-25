import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

export const CONTENT_TYPES_IMAGE_PRODUIT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const

export type ContentTypeImageProduit =
  (typeof CONTENT_TYPES_IMAGE_PRODUIT)[number]

export const PRODUCTS_PREFIX = "products/"
export const DRAFT_PRODUCTS_PREFIX = `${PRODUCTS_PREFIX}brouillons/`

const EXTENSIONS: Record<ContentTypeImageProduit, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
}

export type CodeEchecStockage =
  "non-configure" | "parametre-invalide" | "erreur-stockage"

export interface EchecStockageImageProduit {
  code: CodeEchecStockage
  message: string
}

export type ResultatStockageImageProduit<T> =
  { ok: true; valeur: T } | { ok: false; erreur: EchecStockageImageProduit }

export interface ValeurPresignBrouillon {
  uploadUrl: string
  previewUrl: string
}

export interface ValeurPromotionBrouillon {
  publicUrl: string
}

export interface PortStockageImageProduit {
  presignerBrouillon(input: {
    draftId: string
    contentType: string
    size: number
  }): Promise<ResultatStockageImageProduit<ValeurPresignBrouillon>>
  supprimerBrouillon(input: {
    draftId: string
    contentType: string
  }): Promise<ResultatStockageImageProduit<null>>
  promouvoirBrouillon(input: {
    draftId: string
    contentType: string
  }): Promise<ResultatStockageImageProduit<ValeurPromotionBrouillon>>
  supprimerImagePromue(input: {
    draftId: string
    contentType: string
  }): Promise<ResultatStockageImageProduit<null>>
  supprimerImagePersistee(
    publicUrl: string
  ): Promise<ResultatStockageImageProduit<null>>
}

function storageFailure(
  code: CodeEchecStockage,
  message: string
): { ok: false; erreur: EchecStockageImageProduit } {
  return { ok: false, erreur: { code, message } }
}

function isContentTypeImageProduit(
  contentType: string
): contentType is ContentTypeImageProduit {
  return CONTENT_TYPES_IMAGE_PRODUIT.includes(
    contentType as ContentTypeImageProduit
  )
}

export function extensionForContentType(contentType: string): string | null {
  if (!isContentTypeImageProduit(contentType)) return null
  return EXTENSIONS[contentType]
}

function isStorageIdentifier(value: string): boolean {
  return (
    value.length > 0 && !value.includes("/") && value !== "." && value !== ".."
  )
}

function keyForImage(
  prefix: string,
  imageId: string,
  contentType: string
): string {
  if (!isStorageIdentifier(imageId)) {
    throw new Error("Identifiant d'image invalide")
  }
  const extension = extensionForContentType(contentType)
  if (!extension) throw new Error("Type de fichier non pris en charge")
  return `${prefix}${imageId}${extension}`
}

export function draftObjectKey(draftId: string, contentType: string): string {
  return keyForImage(DRAFT_PRODUCTS_PREFIX, draftId, contentType)
}

export function persistentObjectKey(
  imageId: string,
  contentType: string
): string {
  return keyForImage(PRODUCTS_PREFIX, imageId, contentType)
}

export function publicUrlFromKey(
  key: string,
  publicBase = process.env.R2_PUBLIC_URL
): string | null {
  if (!publicBase) return null
  const base = publicBase.replace(/\/$/, "")
  return base ? `${base}/${key}` : null
}

export function objectKeyFromPublicUrl(
  publicUrl: string,
  publicBase = process.env.R2_PUBLIC_URL
): string | null {
  if (!publicBase) return null
  const base = publicBase.replace(/\/$/, "")
  if (!base || !publicUrl.startsWith(`${base}/`)) return null
  const encodedKey = publicUrl.slice(base.length + 1)
  if (!encodedKey) return null
  try {
    return decodeURIComponent(encodedKey)
  } catch {
    return null
  }
}

export function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  const globalForR2 = globalThis as unknown as { r2?: S3Client }
  if (!globalForR2.r2) {
    globalForR2.r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  return globalForR2.r2
}

interface ConfigurationR2 {
  client: S3Client
  bucket: string
  publicBase: string | null
}

function configurationR2(): ConfigurationR2 | null {
  try {
    const client = getR2Client()
    const bucket = process.env.R2_BUCKET
    if (!client || !bucket) return null
    return { client, bucket, publicBase: process.env.R2_PUBLIC_URL ?? null }
  } catch {
    return null
  }
}

function nonConfigure(): {
  ok: false
  erreur: EchecStockageImageProduit
} {
  return storageFailure("non-configure", "Stockage Cloudflare R2 non configuré")
}

function invalidParameter(message: string): {
  ok: false
  erreur: EchecStockageImageProduit
} {
  return storageFailure("parametre-invalide", message)
}

function storageError(): {
  ok: false
  erreur: EchecStockageImageProduit
} {
  return storageFailure(
    "erreur-stockage",
    "Échec de l'opération de stockage Cloudflare R2"
  )
}

export const stockageImageProduitR2: PortStockageImageProduit = {
  async presignerBrouillon(input) {
    const configuration = configurationR2()
    if (!configuration || !configuration.publicBase) return nonConfigure()

    let key: string
    try {
      key = draftObjectKey(input.draftId, input.contentType)
    } catch (error) {
      return invalidParameter(
        error instanceof Error
          ? error.message
          : "Paramètre de stockage invalide"
      )
    }
    if (
      !Number.isInteger(input.size) ||
      input.size <= 0 ||
      input.size > MAX_UPLOAD_SIZE
    ) {
      return invalidParameter(
        input.size > MAX_UPLOAD_SIZE
          ? "Fichier trop volumineux (10 Mo maximum)"
          : "Taille de fichier invalide"
      )
    }

    try {
      const command = new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: key,
        ContentType: input.contentType,
        ContentLength: input.size,
      })
      const uploadUrl = await getSignedUrl(configuration.client, command, {
        expiresIn: 300,
      })
      const previewUrl = publicUrlFromKey(key, configuration.publicBase)
      if (!previewUrl) return nonConfigure()
      return { ok: true, valeur: { uploadUrl, previewUrl } }
    } catch {
      return storageError()
    }
  },

  async supprimerBrouillon(input) {
    const configuration = configurationR2()
    if (!configuration) return nonConfigure()

    let key: string
    try {
      key = draftObjectKey(input.draftId, input.contentType)
    } catch (error) {
      return invalidParameter(
        error instanceof Error
          ? error.message
          : "Paramètre de stockage invalide"
      )
    }

    try {
      await configuration.client.send(
        new DeleteObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
        })
      )
      return { ok: true, valeur: null }
    } catch {
      return storageError()
    }
  },

  async promouvoirBrouillon(input) {
    const configuration = configurationR2()
    if (!configuration || !configuration.publicBase) return nonConfigure()

    let sourceKey: string
    let destinationKey: string
    try {
      sourceKey = draftObjectKey(input.draftId, input.contentType)
      destinationKey = persistentObjectKey(input.draftId, input.contentType)
    } catch (error) {
      return invalidParameter(
        error instanceof Error
          ? error.message
          : "Paramètre de stockage invalide"
      )
    }

    try {
      await configuration.client.send(
        new CopyObjectCommand({
          Bucket: configuration.bucket,
          Key: destinationKey,
          CopySource: encodeURIComponent(
            `${configuration.bucket}/${sourceKey}`
          ),
        })
      )
      const publicUrl = publicUrlFromKey(
        destinationKey,
        configuration.publicBase
      )
      if (!publicUrl) return nonConfigure()
      return { ok: true, valeur: { publicUrl } }
    } catch {
      return storageError()
    }
  },

  async supprimerImagePromue(input) {
    const configuration = configurationR2()
    if (!configuration) return nonConfigure()

    let key: string
    try {
      key = persistentObjectKey(input.draftId, input.contentType)
    } catch (error) {
      return invalidParameter(
        error instanceof Error
          ? error.message
          : "Paramètre de stockage invalide"
      )
    }

    try {
      await configuration.client.send(
        new DeleteObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
        })
      )
      return { ok: true, valeur: null }
    } catch {
      return storageError()
    }
  },

  async supprimerImagePersistee(publicUrl) {
    const configuration = configurationR2()
    if (!configuration || !configuration.publicBase) return nonConfigure()

    const key = objectKeyFromPublicUrl(publicUrl, configuration.publicBase)
    if (
      !key ||
      !key.startsWith(PRODUCTS_PREFIX) ||
      key.startsWith(DRAFT_PRODUCTS_PREFIX)
    ) {
      return invalidParameter("URL non gérée par le stockage R2")
    }

    // Volontairement non enveloppé : la suppression d'une Image produit
    // persistée est un effet post-commit et best-effort, et ses appelants
    // attrapent pour journaliser. Traduire l'échec en résultat ferait croire au
    // Catalogue que l'objet n'a jamais existé, et le laisser silencieusement
    // échouer à la Structure. Une panne R2 doit être visible dans les deux cas.
    await configuration.client.send(
      new DeleteObjectCommand({
        Bucket: configuration.bucket,
        Key: key,
      })
    )
    return { ok: true, valeur: null }
  },
}

export async function deleteR2Object(
  publicUrl: string
): Promise<ResultatStockageImageProduit<null>> {
  return stockageImageProduitR2.supprimerImagePersistee(publicUrl)
}
