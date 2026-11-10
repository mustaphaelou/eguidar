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
import { adminFormAction } from "@/lib/use-cases/mutation-actions"

const PAGE_IMPORT = "/admin/produits/importer"

export interface TeleversementState {
  error?: string
}

export type VerificationState = TeleversementState

/**
 * Le résultat d'un appel d'application, ou son refus. La page enchaîne les
 * appels tant qu'il reste des Produits ou que l'indexation n'a pas rattrapé.
 */
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

interface LotACurseur {
  lotId: string
  curseur: number
}

/**
 * L'application passe par la porte d'administration : elle ne rend pas de
 * redirection, car la page enchaîne les appels avec le curseur rendu. Un refus
 * du cas d'usage revient en message français, sans rien écrire.
 */
export const appliquerLeLotAction = adminFormAction<
  LotACurseur,
  ApplicationState
>({
  next: PAGE_IMPORT,
  parse: (formData) => {
    const lotId = String(formData.get("lotId") ?? "")
    if (lotId === "") {
      throw new Error("Aucun Lot à appliquer")
    }
    const curseurBrut = String(formData.get("curseur") ?? "")
    if (!/^\d+$/.test(curseurBrut)) {
      throw new Error("Curseur d'application invalide")
    }
    const curseur = Number(curseurBrut)
    if (!Number.isSafeInteger(curseur)) {
      throw new Error("Curseur d'application invalide")
    }
    return { lotId, curseur }
  },
  run: async ({ lotId, curseur }) => appliquerLeLot(lotId, curseur),
})
