import type { EntreeBrouillonImage } from "@/lib/galerie-image-produit"

import portHttpTeleversementBrouillons from "./televersement-brouillons-http"

export const MESSAGE_FICHIER_NON_IMAGE =
  "Seuls les fichiers image sont acceptés"

export interface EntreePresignationBrouillon {
  contentType: string
  size: number
}

export interface EnvoiBrouillon {
  uploadUrl: string
  fichier: File
}

export type RefusTeleversement = { ok: false; message: string }

export interface BrouillonImagePresigne {
  draftId: string
  uploadUrl: string
  previewUrl: string
}

export type ResultatPresignation =
  ({ ok: true } & BrouillonImagePresigne) | RefusTeleversement

export type ResultatEnvoi = { ok: true } | RefusTeleversement

export interface PortTeleversementBrouillons {
  /** Le port refuse : il ne lève jamais. */
  presigner(entree: EntreePresignationBrouillon): Promise<ResultatPresignation>
  envoyer(envoi: EnvoiBrouillon): Promise<ResultatEnvoi>
  relacher(draftId: string): Promise<ResultatEnvoi>
}

export interface FaitsAjoutBrouillons {
  ajoutees: EntreeBrouillonImage[]
  message?: string
}

export interface TeleversementBrouillons {
  ajouter(
    fichiers: readonly File[],
    places: number
  ): Promise<FaitsAjoutBrouillons>
  relacher(draftId: string): Promise<ResultatEnvoi>
}

export function creerTeleversementBrouillons(
  port: PortTeleversementBrouillons
): TeleversementBrouillons {
  return {
    async ajouter(fichiers, places) {
      const ajoutees: EntreeBrouillonImage[] = []
      let message: string | undefined

      for (const fichier of fichiers) {
        if (ajoutees.length >= Math.max(0, places)) break

        if (!fichier.type.startsWith("image/")) {
          message = MESSAGE_FICHIER_NON_IMAGE
          continue
        }

        const presignation = await port.presigner({
          contentType: fichier.type,
          size: fichier.size,
        })
        if (!presignation.ok) {
          message = presignation.message
          continue
        }

        const envoi = await port.envoyer({
          uploadUrl: presignation.uploadUrl,
          fichier,
        })
        if (!envoi.ok) {
          message = envoi.message
          continue
        }

        ajoutees.push({
          kind: "brouillon",
          draftId: presignation.draftId,
          previewUrl: presignation.previewUrl,
        })
      }

      return message === undefined ? { ajoutees } : { ajoutees, message }
    },

    relacher(draftId) {
      return port.relacher(draftId)
    },
  }
}

const televersementBrouillons: TeleversementBrouillons =
  creerTeleversementBrouillons(portHttpTeleversementBrouillons)

export default televersementBrouillons
