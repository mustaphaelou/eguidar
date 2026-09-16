import { z } from "zod"

import { createPresignedUploadUrl } from "@/lib/r2"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const presignSchema = z.object({
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
  ]),
  size: z.number().int().positive(),
})

export async function POST(request: Request) {
  const client = await lireSession()
  if (!estAdmin(client))
    return Response.json({ error: "Non autorisé" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    )
  }

  const parsed = presignSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: "Requête invalide" }, { status: 400 })

  try {
    const { uploadUrl, publicUrl } = await createPresignedUploadUrl(parsed.data)
    return Response.json({ uploadUrl, publicUrl })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Échec de la pré-signature",
      },
      { status: 500 }
    )
  }
}
