"use server"

import { redirect } from "next/navigation"

import {
  construireUrlExecutions,
  parseFiltresExecutions,
  type FiltresExecutions,
} from "@/lib/automatisations-listing"
import {
  adminFormAction,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import {
  basculerRegle,
  creerRegle,
  modifierRegle,
  reessayerExecution,
  type EntreeRegle,
} from "@/lib/use-cases/automatisations"

const LISTE = "/admin/automatisations"
const HISTORIQUE = "/admin/automatisations/executions"

type EntreeFormulaire = EntreeRegle & { regleId?: string }

function conditionDuFormulaire(formData: FormData): EntreeRegle["condition"] {
  const type = String(formData.get("conditionType") ?? "")
  if (type !== "statut-commande") return { type }
  return {
    type,
    statuts: formData.getAll("statuts").map((statut) => String(statut)),
  }
}

function configurationDuFormulaire(
  formData: FormData
): EntreeRegle["configuration"] {
  const variable = String(formData.get("destinataireVariable") ?? "").trim()
  return variable ? { destinataireVariable: variable } : undefined
}

function parseRegleFormData(formData: FormData): EntreeFormulaire {
  const regleId = String(formData.get("regleId") ?? "").trim()
  return {
    ...(regleId ? { regleId } : {}),
    nom: String(formData.get("nom") ?? ""),
    declencheur: String(formData.get("declencheur") ?? ""),
    condition: conditionDuFormulaire(formData),
    action: String(formData.get("action") ?? ""),
    configuration: configurationDuFormulaire(formData),
    actif: formData.get("actif") === "on",
  }
}

interface BasculeFormulaire {
  regleId: string
  actif: boolean
  retour: "regle" | "liste"
}

interface ReessaiFormulaire {
  executionId: string
  filtres: FiltresExecutions
}

export const enregistrerRegleAction = adminFormAction<EntreeFormulaire>({
  next: LISTE,
  parse: parseRegleFormData,
  run: async (entree, caller) => {
    if (entree.regleId) {
      await modifierRegle({ ...entree, regleId: entree.regleId }, caller.email)
      redirect(`${LISTE}/${entree.regleId}`)
    }

    const id = await creerRegle(entree, caller.email)
    redirect(`${LISTE}/${id}`)
  },
})

export const basculerRegleAction = adminFormAction<BasculeFormulaire>({
  next: LISTE,
  parse: (formData) => ({
    regleId: parseRequiredId(formData, "regleId"),
    actif: formData.get("actif") === "actif",
    retour: formData.get("retour") === "regle" ? "regle" : "liste",
  }),
  run: async (entree, caller) => {
    await basculerRegle(entree.regleId, entree.actif, caller.email)
    redirect(entree.retour === "regle" ? `${LISTE}/${entree.regleId}` : LISTE)
  },
})

export const reessayerExecutionAction = adminFormAction<ReessaiFormulaire>({
  next: HISTORIQUE,
  parse: (formData) => ({
    executionId: parseRequiredId(formData, "executionId"),
    filtres: parseFiltresExecutions({
      statut: String(formData.get("statut") ?? ""),
      regle: String(formData.get("regle") ?? ""),
      depuis: String(formData.get("depuis") ?? ""),
    }),
  }),
  run: async (entree) => {
    await reessayerExecution(entree.executionId)
    redirect(`${HISTORIQUE}${construireUrlExecutions(entree.filtres)}`)
  },
})
