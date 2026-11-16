"use server"

import { redirect } from "next/navigation"

import {
  appliquerLeLot,
  televerserLeFichier,
  verifierLeLot,
} from "@/lib/use-cases/import-produits"
import type {
  EchecProduitApplication,
  StatutLotImport,
} from "@/lib/import-produits"
import {
  adminFormAction,
  parseEntierObligatoire,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"

const PAGE_IMPORT = "/admin/produits/importer"

export interface TeleversementState {
  error?: string
}

export type VerificationState = TeleversementState

export interface ApplicationState {
  error?: string
  lotId?: string
  traites?: number
  reste?: number
  curseurSuivant?: number
  ecrits?: number
  indexes?: number
  echecs?: EchecProduitApplication[]
  indexationEnAttente?: boolean
  statut?: StatutLotImport
}

interface FichierTeleverse {
  fichier: File
}

interface LotAVerifier {
  lotId: string
}

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

export const verifierLeLotAction = adminFormAction<
  LotAVerifier,
  VerificationState
>({
  next: PAGE_IMPORT,
  parse: (formData) => ({
    lotId: parseRequiredId(formData, "lotId", "Aucun Lot à vérifier"),
  }),
  run: async ({ lotId }) => {
    await verifierLeLot(lotId)
    redirect(`${PAGE_IMPORT}?lot=${lotId}`)
  },
})

interface LotACurseur {
  lotId: string
  curseur: number
}

export const appliquerLeLotAction = adminFormAction<
  LotACurseur,
  ApplicationState
>({
  next: PAGE_IMPORT,
  parse: (formData) => ({
    lotId: parseRequiredId(formData, "lotId", "Aucun Lot à appliquer"),
    curseur: parseEntierObligatoire(
      formData,
      "curseur",
      "Curseur d'application invalide"
    ),
  }),
  run: async ({ lotId, curseur }) => appliquerLeLot(lotId, curseur),
})
