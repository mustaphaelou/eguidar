import { randomUUID } from "node:crypto"

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export class R2NotConfiguredError extends Error {
  constructor() {
    super("Stockage Cloudflare R2 non configuré")
    this.name = "R2NotConfiguredError"
  }
}

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
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

export async function createPresignedUploadUrl(input: {
  contentType: string
  size: number
}): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET
  const publicBase = process.env.R2_PUBLIC_URL
  if (!client || !bucket || !publicBase) throw new R2NotConfiguredError()

  const extension = EXTENSIONS[input.contentType]
  if (!extension) throw new Error("Type de fichier non pris en charge")
  if (input.size > MAX_UPLOAD_SIZE) throw new Error("Fichier trop volumineux (10 Mo maximum)")

  const key = `products/${randomUUID()}${extension}`
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.size,
  })
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })

  return { uploadUrl, publicUrl: `${publicBase.replace(/\/$/, "")}/${key}`, key }
}

function objectKeyFromPublicUrl(publicUrl: string, publicBase: string): string | null {
  const base = publicBase.replace(/\/$/, "")
  if (!publicUrl.startsWith(`${base}/`)) return null
  const key = publicUrl.slice(base.length + 1)
  return key ? decodeURIComponent(key) : null
}

export async function deleteR2Object(publicUrl: string): Promise<boolean> {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET
  const publicBase = process.env.R2_PUBLIC_URL
  if (!client || !bucket || !publicBase) return false

  const key = objectKeyFromPublicUrl(publicUrl, publicBase)
  if (!key) return false

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  return true
}
