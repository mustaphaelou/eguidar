import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import {
  MESSAGE_FORMAT_NON_AUTORISE,
  inspecterImageProduit,
} from "@/lib/verification-image-produit"

import {
  PREFIXE_BROUILLONS_IMAGE_PRODUIT,
  PREFIXE_IMAGES_PRODUIT,
  cleDepuisUrlPublique,
  cleImageProduitPersistee,
} from "@/lib/espace-de-noms-image-produit"

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

export const DUREE_VIE_URL_ENVOI_PRESIGNEE_S = 300

export const CONTENT_TYPES_IMAGE_PRODUIT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const

export type ContentTypeImageProduit =
  (typeof CONTENT_TYPES_IMAGE_PRODUIT)[number]

const EXTENSIONS: Record<ContentTypeImageProduit, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
}

export type CodeEchecStockage =
  "non-configure" | "parametre-invalide" | "erreur-stockage" | "contenu-refuse"

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

export interface FaitImageProduitVerifiee {
  mimeType: string
  byteSize: number
  width: number
  height: number
}

export interface PortStockageImageProduit {
  presignerBrouillon(input: {
    draftId: string
    contentType: ContentTypeImageProduit
    size: number
  }): Promise<ResultatStockageImageProduit<ValeurPresignBrouillon>>
  verifierBrouillon(input: {
    draftId: string
    contentType: ContentTypeImageProduit
  }): Promise<ResultatStockageImageProduit<FaitImageProduitVerifiee>>
  supprimerBrouillon(input: {
    draftId: string
    contentType: ContentTypeImageProduit
  }): Promise<ResultatStockageImageProduit<null>>
  promouvoirBrouillon(input: {
    draftId: string
    contentType: ContentTypeImageProduit
  }): Promise<ResultatStockageImageProduit<ValeurPromotionBrouillon>>
  supprimerImagePromue(input: {
    draftId: string
    contentType: ContentTypeImageProduit
  }): Promise<ResultatStockageImageProduit<null>>
  supprimerImagePersistee(
    publicUrl: string
  ): Promise<ResultatStockageImageProduit<null>>
  supprimerImageCategorie(
    publicUrl: string
  ): Promise<ResultatStockageImageProduit<null>>
}

function storageFailure(
  code: CodeEchecStockage,
  message: string
): { ok: false; erreur: EchecStockageImageProduit } {
  return { ok: false, erreur: { code, message } }
}

export function isContentTypeImageProduit(
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
  return keyForImage(PREFIXE_BROUILLONS_IMAGE_PRODUIT, draftId, contentType)
}

export function persistentObjectKey(
  imageId: string,
  contentType: string
): string {
  return keyForImage(PREFIXE_IMAGES_PRODUIT, imageId, contentType)
}

export function publicUrlFromKey(
  key: string,
  publicBase = process.env.R2_PUBLIC_URL
): string | null {
  if (!publicBase) return null
  const base = publicBase.replace(/\/$/, "")
  return base ? `${base}/${key}` : null
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

function estCleImageCategorie(key: string): boolean {
  return !key.startsWith(PREFIXE_BROUILLONS_IMAGE_PRODUIT)
}

function cleImageCategorie(
  publicUrl: string,
  publicBase: string
): string | null {
  const key = cleDepuisUrlPublique(publicUrl, publicBase)
  return key !== null && estCleImageCategorie(key) ? key : null
}

async function supprimerImageParUrl(
  publicUrl: string,
  cleDansLEspaceDeNoms: (publicUrl: string, publicBase: string) => string | null
): Promise<ResultatStockageImageProduit<null>> {
  const configuration = configurationR2()
  if (!configuration || !configuration.publicBase) return nonConfigure()

  const key = cleDansLEspaceDeNoms(publicUrl, configuration.publicBase)
  if (!key) {
    return invalidParameter("URL non gérée par le stockage R2")
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
}

async function octetsDuCorps(body: unknown): Promise<Buffer | null> {
  const transform = (
    body as { transformToByteArray?: () => Promise<Uint8Array> } | null
  )?.transformToByteArray
  if (typeof transform !== "function") return null
  try {
    return Buffer.from(await transform.call(body))
  } catch {
    return null
  }
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
        expiresIn: DUREE_VIE_URL_ENVOI_PRESIGNEE_S,
      })
      const previewUrl = publicUrlFromKey(key, configuration.publicBase)
      if (!previewUrl) return nonConfigure()
      return { ok: true, valeur: { uploadUrl, previewUrl } }
    } catch {
      return storageError()
    }
  },

  async verifierBrouillon(input) {
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
      const head = await configuration.client.send(
        new HeadObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
        })
      )
      if (!isContentTypeImageProduit(head.ContentType ?? "")) {
        return storageFailure("contenu-refuse", MESSAGE_FORMAT_NON_AUTORISE)
      }
      if (
        head.ContentLength === undefined ||
        !Number.isInteger(head.ContentLength) ||
        head.ContentLength <= 0
      ) {
        return invalidParameter("Taille de fichier invalide")
      }
      if (head.ContentLength > MAX_UPLOAD_SIZE) {
        return invalidParameter("Fichier trop volumineux (10 Mo maximum)")
      }

      const objet = await configuration.client.send(
        new GetObjectCommand({ Bucket: configuration.bucket, Key: key })
      )
      const octets = await octetsDuCorps(objet.Body)
      if (!octets) return storageError()

      const inspection = await inspecterImageProduit(octets)
      if (!inspection.ok) {
        return storageFailure(inspection.code, inspection.message)
      }
      if (inspection.image.byteSize > MAX_UPLOAD_SIZE) {
        return storageFailure(
          "contenu-refuse",
          "Le fichier envoyé est trop volumineux (10 Mo maximum)"
        )
      }

      await configuration.client.send(
        new PutObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
          Body: inspection.image.bytes,
          ContentType: inspection.image.mimeType,
        })
      )
      return {
        ok: true,
        valeur: {
          mimeType: inspection.image.mimeType,
          byteSize: inspection.image.byteSize,
          width: inspection.image.width,
          height: inspection.image.height,
        },
      }
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
    return supprimerImageParUrl(publicUrl, cleImageProduitPersistee)
  },

  async supprimerImageCategorie(publicUrl) {
    return supprimerImageParUrl(publicUrl, cleImageCategorie)
  },
}
