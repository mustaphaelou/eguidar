import type { TestContext } from "vitest"
import { describe, expect, it } from "vitest"

import {
  BUDGET_DE_LECTURE,
  comparerLesChecks,
  contextesDeclares,
  jetonDuDepot,
  lireLesExigences,
  type Exigences,
} from "./registre"

/**
 * La lecture du ruleset, une fois pour toute la suite — et pas avant qu'un
 * test la demande. Les deux assertions portent sur les mêmes réglages, lus au
 * même instant : deux lectures pourraient tomber de part et d'autre d'une
 * édition du ruleset, et ne jamais se contredire. Une lecture qui échoue reste
 * en mémoire, échec compris, pour que la seconde assertion redise la même cause
 * au lieu d'en chercher une autre.
 */
let lue: Promise<Exigences> | null = null

/**
 * Les exigences du dépôt, lues — ou la suite se tait en disant pourquoi.
 *
 * L'absence d'identifiant n'est pas un rouge : un contributeur qui n'a aucun
 * moyen de lire les réglages de GitHub ne peut rien décider de ce que la suite
 * constate, et le faire échouer lui annoncerait une dérive qu'il n'a pas
 * constatée. Mais le silence doit se voir : c'est `skip(note)` qui l'affiche
 * dans le rapport, et non un `it.skip` muet, pour que personne n'y lise un
 * « vérifié » qu'aucun run n'a établi.
 *
 * Le cas d'en face n'a pas d'issue douce, et c'est délibéré : un identifiant
 * présent dont la lecture échoue est une panne de GitHub ou une permission
 * retirée, deux choses qui se réparent et qu'aucune pull request ne devrait
 * bloquer. `lireLesExigences` réessaie trois fois, puis lève en nommant la
 * cause — l'erreur que la spec exige.
 */
async function exigerLesExigences(leContexte: TestContext): Promise<Exigences> {
  const jeton = jetonDuDepot()
  if (jeton === null) {
    return leContexte.skip(
      "aucun moyen de lire les réglages de GitHub : ni `GITHUB_TOKEN`, ni `GH_TOKEN`, ni une session `gh`"
    )
  }

  lue ??= lireLesExigences(jeton)
  return lue
}

describe("le ruleset exige exactement les portes que la CI déclare", () => {
  // Le timeout est celui que le module calcule — trois requêtes bornées et deux
  // pauses — et non les 5 000 ms par défaut de Vitest, qui sont le délai d'une
  // seule requête : le run échouerait alors sur son propre délai d'attente, en
  // nommant une porte qui n'a rien à voir avec la cause.
  it(
    "ne laisse aucun job dont le statut ne soit pas exigé, ni aucun statut exigé qu'aucun job ne fournisse",
    async (leContexte) => {
      const { nom, contextes } = await exigerLesExigences(leContexte)
      const { nonExigés, sansJob } = comparerLesChecks(
        contextesDeclares(),
        contextes
      )

      // Les deux sens dans un seul test, et non un test par sens : ils ne se
      // contredisent pas, et un écart qui n'en nommerait qu'un laisserait passer
      // l'autre. Le premier est la dérive qui a eu lieu — un job vert partout,
      // que rien n'attend devant la fusion. Le second est un job supprimé, qui
      // bloque une pull request sans raison.
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

      // Ces deux-là sont dans l'ADR-0020, et ils sont les seuls qu'on vérifie en
      // plus de la liste des portes. Ni le nombre d'approbations — passer de 0 à
      // 1 serait plus de protection, et un test qui rougit sur une amélioration
      // est un test à supprimer — ni la liste des contournements, que l'API
      // masque sans droit d'écriture : une assertion là-dessus ne pourrait jamais
      // tourner, donc elle ne prouverait jamais rien.
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
