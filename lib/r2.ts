import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

/**
 * Durée de vie d'une URL d'envoi pré-signée, en secondes. Exportée parce que
 * la rétention d'un Brouillon d'Image produit est délibérément plus longue :
 * c'est ce qui permet de réessayer un enregistrement échoué sans téléverser
 * l'image à nouveau (ADR-0004). Les deux durées sont liées par une propriété
 * vérifiée, pas par une convention.
 */
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

/**
 * Le port de stockage des Images produit.
 *
 * **Un type de contenu y est l'union des types autorisés, pas une chaîne.**
 * L'implémentation refuse depuis toujours tout ce qui n'est pas l'un des cinq,
 * à la dérivation de la clé ; déclarer `string` ici l'admettait quand même, et
 * l'interface promettait donc une valeur que le port ne tenait pas. La
 * restriction vit désormais dans le type, et c'est le compilateur — non un
 * contrôle à l'exécution — qui arrête un appelant qui passerait le reste.
 */
export interface PortStockageImageProduit {
  presignerBrouillon(input: {
    draftId: string
    contentType: ContentTypeImageProduit
    size: number
  }): Promise<ResultatStockageImageProduit<ValeurPresignBrouillon>>
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
  /**
   * Image de Structure : champ URL libre, antérieur au cycle de vie des
   * Brouillons, qui vit hors du préfixe `products/`. Même frontière
   * best-effort que `supprimerImagePersistee` : une panne R2 devient un refus
   * que l'appelant journalise. Les espaces de noms sont disjoints, voir les
   * gardes ci-dessous.
   */
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

/**
 * Le seul prédicat du type de contenu, et il est exporté parce que le module
 * propriétaire en a besoin pour le même travail : décider si une valeur qu'il
 * reçoit du texte est l'un des types autorisés. Deux listes ne le direient pas
 * deux fois — celle du module de stockage et celle, indépendante, de la route de
 * téléversement.
 */
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

/**
 * La dérivation de clé, et le refus qui l'accompagne.
 *
 * **Le paramètre reste un `string`, contrairement au port.** Ces deux exports
 * sont la convention d'espace de noms d'ADR-0004, et l'invariant qu'elle porte
 * — une clé ne se dérive jamais d'un type refusé — se garde à l'exécution : le
 * port a déjà arrêté l'appelant qui passerait le reste, mais une dérivation
 * appelée ailleurs refuse encore, et elle refuse par une exception, comme les
 * quatre opérations du port s'attendent à le lire.
 */
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

/**
 * Deux opérations de suppression par URL, un seul invariant partagé : ni
 * l'une ni l'autre ne peut viser `products/brouillons/`.
 *
 * Une Image produit persistée n'existe que sous `products/`, hors du préfixe
 * réservé aux Brouillons. Une image de Structure est le champ `image` d'une
 * catégorie, antérieure à ce cycle de vie : elle est n'importe où sous la base
 * publique — y compris sous `products/`, comportement conservé pour les
 * catégories — mais jamais dans l'espace réservé. Une suppression de catégorie
 * ne doit jamais pouvoir supprimer un Brouillon abandonné, dont l'expiration
 * est le fait de la règle de cycle de vie R2 (ADR-0004).
 */
function estCleImageProduitPersistee(key: string): boolean {
  return (
    key.startsWith(PRODUCTS_PREFIX) && !key.startsWith(DRAFT_PRODUCTS_PREFIX)
  )
}

function estCleImageCategorie(key: string): boolean {
  return !key.startsWith(DRAFT_PRODUCTS_PREFIX)
}

/**
 * Suppression par URL publique, bornée par un espace de noms.
 *
 * L'envoi n'est plus nu : les six opérations du port répondent de la même
 * façon à une panne R2, en `erreur-stockage`. Il l'était pour une raison qui
 * tient toujours — une suppression est un effet post-commit et best-effort,
 * et une panne R2 doit rester visible — mais cette raison ne demandait pas
 * une exception. Les deux appelants journalisent aussi bien un refus qu'une
 * levée : traduire ne leur fait donc pas croire que l'objet n'a jamais
 * existé, et ne laisse rien passer inaperçu. Ce qui change est le chemin,
 * donc le vocabulaire qui atteint le journal : un code d'échec du stockage
 * plutôt qu'une `Error` du SDK.
 *
 * L'invariant d'ADR-0014 — « `deleteImages` ne rejette jamais » — porte sur
 * l'effet du Catalogue, pas sur cet appel R2, et reste vrai : le refus est
 * journalisé comme l'était l'exception, et l'effet reste sous la garde
 * externe qui empêche même une spy injectée de jeter.
 */
async function supprimerImageParUrl(
  publicUrl: string,
  dansEspaceDeNoms: (key: string) => boolean
): Promise<ResultatStockageImageProduit<null>> {
  const configuration = configurationR2()
  if (!configuration || !configuration.publicBase) return nonConfigure()

  const key = objectKeyFromPublicUrl(publicUrl, configuration.publicBase)
  if (!key || !dansEspaceDeNoms(key)) {
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
    return supprimerImageParUrl(publicUrl, estCleImageProduitPersistee)
  },

  async supprimerImageCategorie(publicUrl) {
    return supprimerImageParUrl(publicUrl, estCleImageCategorie)
  },
}
