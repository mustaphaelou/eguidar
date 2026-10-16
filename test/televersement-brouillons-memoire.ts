import type {
  EnvoiBrouillon,
  EntreePresignationBrouillon,
  PortTeleversementBrouillons,
  ResultatEnvoi,
  ResultatPresignation,
} from "@/components/admin/televersement-brouillons"

export type AppelTeleversement =
  | ({ operation: "presigner" } & EntreePresignationBrouillon)
  | ({ operation: "envoyer" } & EnvoiBrouillon)
  | { operation: "relacher"; draftId: string }

export interface ReponsesTeleversement {
  presigner?: (
    entree: EntreePresignationBrouillon
  ) => ResultatPresignation | Promise<ResultatPresignation>
  envoyer?: (envoi: EnvoiBrouillon) => ResultatEnvoi | Promise<ResultatEnvoi>
  relacher?: (draftId: string) => ResultatEnvoi | Promise<ResultatEnvoi>
}

export function creerPortTeleversementEnMemoire(
  reponses: ReponsesTeleversement = {}
): PortTeleversementBrouillons & { appels: AppelTeleversement[] } {
  const appels: AppelTeleversement[] = []
  let rang = 0

  return {
    appels,
    async presigner(entree) {
      appels.push({ operation: "presigner", ...entree })
      if (reponses.presigner) return reponses.presigner(entree)
      rang += 1
      return {
        ok: true,
        draftId: `brouillon-${rang}`,
        uploadUrl: `https://televersement.example.test/${rang}`,
        previewUrl: `https://cdn.example.test/products/brouillons/brouillon-${rang}.png`,
      }
    },
    async envoyer(envoi) {
      appels.push({ operation: "envoyer", ...envoi })
      return reponses.envoyer ? reponses.envoyer(envoi) : { ok: true }
    },
    async relacher(draftId) {
      appels.push({ operation: "relacher", draftId })
      return reponses.relacher ? reponses.relacher(draftId) : { ok: true }
    },
  }
}
