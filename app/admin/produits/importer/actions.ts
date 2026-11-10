"use server"

import { redirect } from "next/navigation"

import { televerserLeFichier } from "@/lib/use-cases/import-produits"
import { adminFormAction } from "@/lib/use-cases/mutation-actions"

const PAGE_IMPORT = "/admin/produits/importer"

export interface TeleversementState {
  error?: string
}

interface FichierTeleverse {
  fichier: File
}

/**
 * Le téléversement passe par la porte d'administration : un compte ordinaire
 * est redirigé vers la Connexion avant que le fichier ne soit lu. L'action ne
 * juge rien elle-même : elle confie les octets au cas d'usage.
 */
export const televerserLeFichierAction = adminFormAction<
  FichierTeleverse,
  TeleversementState
>({
  next: PAGE_IMPORT,
  parse: (formData) => {
    const fichier = formData.get("fichier")
    if (!(fichier instanceof File)) {
      throw new Error("Aucun fichier reçu")
    }
    return { fichier }
  },
  run: async ({ fichier }, client) => {
    const octets = new Uint8Array(await fichier.arrayBuffer())
    const lot = await televerserLeFichier({
      nomFichier: fichier.name,
      octets,
      auteurId: client.id,
    })

    redirect(`${PAGE_IMPORT}?lot=${lot.lotId}`)
  },
})
