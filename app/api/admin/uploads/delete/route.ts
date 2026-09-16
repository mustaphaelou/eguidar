import { z } from "zod"

import { deleteR2Object } from "@/lib/r2"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const deleteSchema = z.object({
  url: z.string().min(1),
})

export async function DELETE(request: Request) {
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

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: "Requête invalide" }, { status: 400 })

  try {
    const deleted = await deleteR2Object(parsed.data.url)
    if (!deleted) {
      return Response.json(
        { error: "URL non gérée par le stockage R2" },
        { status: 400 }
      )
    }
    return Response.json({ deleted: true })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Échec de la suppression",
      },
      { status: 500 }
    )
  }
}
