import {
  messageDuRefus,
  serialiserLesRefusCsv,
  type RefusCsvImport,
} from "@/lib/import-produits"
import { lireLeLot, type LigneImportLue } from "@/lib/use-cases/import-produits"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const ENTETES_SANS_CACHE = { "Cache-Control": "private, no-store" } as const

function nomDuFichier(lotId: string): string {
  return `refus-import-${lotId}.csv`
}

function refusCsvDeLaLigne(ligne: LigneImportLue): RefusCsvImport | null {
  if (ligne.refus !== null) {
    return {
      numero: ligne.numero,
      code: ligne.refus.code,
      message: messageDuRefus(ligne.refus),
      cellules: ligne.cellules,
    }
  }
  if (ligne.statut !== "refusee") return null
  return {
    numero: ligne.numero,
    code: ligne.codeRefus ?? "",
    message: "",
    cellules: ligne.cellules,
  }
}

/**
 * Le CSV des refus d'un Lot : une Ligne refusée par ligne, avec son numéro, son
 * code, son message français et ses neuf cellules brutes. Tout vient de la base
 * — les cellules sont persistées — : le fichier d'origine n'est jamais relu.
 *
 * La route est une lecture réservée à l'Administration ; la porte JSON ne rend
 * que du JSON et n'a donc pas sa place ici, comme pour le modèle.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ lotId: string }> }
): Promise<Response> {
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

  const { lotId } = await params
  const lot = await lireLeLot(lotId)
  if (lot === null) {
    return new Response("Ce Lot d'import est introuvable.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...ENTETES_SANS_CACHE,
      },
    })
  }

  const refus = lot.lignes.flatMap((ligne) => {
    const refusCsv = refusCsvDeLaLigne(ligne)
    return refusCsv === null ? [] : [refusCsv]
  })

  return new Response(serialiserLesRefusCsv(refus), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomDuFichier(lotId)}"`,
      ...ENTETES_SANS_CACHE,
    },
  })
}
