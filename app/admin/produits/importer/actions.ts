"use server"

import { redirect } from "next/navigation"

import {
  televerserLeFichier,
  verifierLeLot,
} from "@/lib/use-cases/import-produits"
import { adminFormAction } from "@/lib/use-cases/mutation-actions"

const PAGE_IMPORT = "/admin/produits/importer"

export interface TeleversementState {
  error?: string
}

export type VerificationState = TeleversementState

interface FichierTeleverse {
  fichier: File
}

interface LotAVerifier {
  lotId: string
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

/**
 * La Vérification passe par la porte d'administration et confie le Lot au cas
 * d'usage ; un Lot impossible à rejuger revient en message français, sans
 * redirection. Sinon la page est rechargée sur le Lot désormais `verifie`.
 */
export const verifierLeLotAction = adminFormAction<
  LotAVerifier,
  VerificationState
>({
  next: PAGE_IMPORT,
  parse: (formData) => {
    const lotId = formData.get("lotId")
    if (typeof lotId !== "string" || lotId === "") {
      throw new Error("Aucun Lot à vérifier")
    }
    return { lotId }
  },
  run: async ({ lotId }) => {
    await verifierLeLot(lotId)
    redirect(`${PAGE_IMPORT}?lot=${lotId}`)
  },
})
