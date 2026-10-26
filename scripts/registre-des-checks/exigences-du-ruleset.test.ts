import type { TestContext } from "vitest"
import { describe, expect, it } from "vitest"

import {
  BUDGET_DE_LECTURE,
  comparerLesChecks,
  contextesDeclares,
  estRefusDeDroits,
  jetonDuDepot,
  lireLesExigences,
  type Exigences,
} from "./registre"

const INDISPONIBLE =
  "les règles de protection de `main` ne sont pas lisibles avec ce jeton (HTTP 403 ou 404) : le contrôle est ignoré"

let lue: Promise<Exigences | null> | null = null

async function exigerLesExigences(leContexte: TestContext): Promise<Exigences> {
  const jeton = jetonDuDepot()
  if (jeton === null) {
    return leContexte.skip(
      "aucun moyen de lire les réglages de GitHub : ni `GITHUB_TOKEN`, ni `GH_TOKEN`, ni une session `gh`"
    )
  }

  // Un refus de droits n'est pas une dérive du ruleset : la suite ne peut pas
  // lire les réglages, elle s'ignore au lieu de faire échouer la CI.
  lue ??= lireLesExigences(jeton).catch((erreur: unknown) => {
    if (estRefusDeDroits(erreur)) return null
    throw erreur
  })

  const exigences = await lue
  if (exigences === null) return leContexte.skip(INDISPONIBLE)
  return exigences
}

describe("le ruleset exige exactement les portes que la CI déclare", () => {
  it(
    "ne laisse aucun job dont le statut ne soit pas exigé, ni aucun statut exigé qu'aucun job ne fournisse",
    async (leContexte) => {
      const { nom, contextes } = await exigerLesExigences(leContexte)
      const { nonExigés, sansJob } = comparerLesChecks(
        contextesDeclares(),
        contextes
      )

      expect(
        nonExigés.map(
          (contexte) =>
            `« ${contexte} » : le flux déclare ce job et le ruleset « ${nom} » n'en exige pas le statut — une porte que rien n'arrête avant la fusion. Le correctif est d'ajouter « ${contexte} » aux statuts exigés du ruleset « ${nom} ».`
        )
      ).toEqual([])

      expect(
        sansJob.map(
          (contexte) =>
            `« ${contexte} » : le ruleset « ${nom} » exige ce statut et aucun job du flux ne le fournit — une exigence que plus rien ne peut satisfaire, qui bloquera la prochaine pull request sans raison. Le correctif est de retirer « ${contexte} » du ruleset « ${nom} ».`
        )
      ).toEqual([])
    },
    BUDGET_DE_LECTURE
  )

  it(
    "exige une branche à jour, et son exigence dès la création de la pull request",
    async (leContexte) => {
      const { exigeBrancheAJour, suspendLExigenceALaCreation } =
        await exigerLesExigences(leContexte)

      expect(
        [
          exigeBrancheAJour
            ? ""
            : "`strict_required_status_checks_policy` est désactivé : une pull request peut être fusionnée sans que sa branche soit à jour avec `main`, donc avec des statuts calculés sur un `main` déjà dépassé.",
          suspendLExigenceALaCreation
            ? "`do_not_enforce_on_create` est activé : l'exigence ne court qu'après la première synchronisation, et une pull request ouverte peut être fusionnée sans qu'aucun de ses statuts se soit exécuté."
            : "",
        ].filter((motif) => motif !== "")
      ).toEqual([])
    },
    BUDGET_DE_LECTURE
  )
})
