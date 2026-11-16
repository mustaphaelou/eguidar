import { contenuDuModele, NOM_MODELE_IMPORT } from "@/lib/import-produits"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const ENTETES_SANS_CACHE = { "Cache-Control": "private, no-store" } as const

export async function GET(): Promise<Response> {
  const client = await lireSession()
  if (!estAdmin(client)) {
    return new Response("Non autorisé", {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...ENTETES_SANS_CACHE,
      },
    })
  }

  return new Response(contenuDuModele(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${NOM_MODELE_IMPORT}"`,
      ...ENTETES_SANS_CACHE,
    },
  })
}
