import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  comparerLaPorteAuxFaits,
  lireLaPorteDeFusion,
  phraseDeLEcart,
  type EcartDeLaPorte,
  type PorteDeFusion,
} from "@/infra/porte-de-fusion"
import { messageDe } from "../../lib/valeur"

import {
  lireLaPorteVivante,
  type DependancesDeLecture,
  type LectureDeLaPorte,
} from "./lecture-du-ruleset"

export type VerdictDeLaPorte =
  | { etat: "conforme"; nom: string }
  | { etat: "derive"; nom: string; ecarts: EcartDeLaPorte[] }
  | { etat: "illisible"; raison: string }

export function codeDeSortie(verdict: VerdictDeLaPorte): 0 | 1 | 2 {
  switch (verdict.etat) {
    case "conforme":
      return 0
    case "derive":
      return 1
    case "illisible":
      return 2
  }
}

export function verdictDeLaLecture(
  contrat: PorteDeFusion,
  lecture: LectureDeLaPorte
): VerdictDeLaPorte {
  if (!lecture.lisible) {
    return { etat: "illisible", raison: lecture.raison }
  }

  const ecarts = comparerLaPorteAuxFaits(contrat, lecture.faits)
  if (ecarts.length === 0) {
    return { etat: "conforme", nom: lecture.faits.nom }
  }
  return { etat: "derive", nom: lecture.faits.nom, ecarts }
}

export type DependancesDuVerificateur = {
  lireContrat: () => PorteDeFusion
  lecture: Partial<DependancesDeLecture>
  ecrire: (texte: string) => void
  ecrireErreur: (texte: string) => void
}

function dependancesParDefautDuVerificateur(): DependancesDuVerificateur {
  return {
    lireContrat: lireLaPorteDeFusion,
    lecture: {},
    ecrire: (texte) => {
      process.stdout.write(`${texte}\n`)
    },
    ecrireErreur: (texte) => {
      process.stderr.write(`${texte}\n`)
    },
  }
}

function annoncerLIllisibilite(
  dependances: DependancesDuVerificateur,
  verdict: Extract<VerdictDeLaPorte, { etat: "illisible" }>
): 0 | 1 | 2 {
  dependances.ecrireErreur(
    `La Porte de fusion n'est pas lisible : ${verdict.raison}`
  )
  dependances.ecrireErreur(
    "Le docteur ne peut pas conclure : ce n'est pas une dérive."
  )
  return codeDeSortie(verdict)
}

export async function verifierLaPorte(
  dependances: Partial<DependancesDuVerificateur> = {}
): Promise<0 | 1 | 2> {
  const deps = {
    ...dependancesParDefautDuVerificateur(),
    ...dependances,
  }

  let contrat: PorteDeFusion
  try {
    contrat = deps.lireContrat()
  } catch (erreur) {
    return annoncerLIllisibilite(deps, {
      etat: "illisible",
      raison: messageDe(erreur),
    })
  }

  let lecture: LectureDeLaPorte
  try {
    lecture = await lireLaPorteVivante(contrat, deps.lecture ?? {})
  } catch (erreur) {
    return annoncerLIllisibilite(deps, {
      etat: "illisible",
      raison: messageDe(erreur),
    })
  }

  const verdict = verdictDeLaLecture(contrat, lecture)

  if (verdict.etat === "illisible") {
    return annoncerLIllisibilite(deps, verdict)
  }

  if (verdict.etat === "conforme") {
    deps.ecrire(
      `La Porte de fusion est conforme : le ruleset « ${verdict.nom} » porte tous les faits du contrat.`
    )
    return codeDeSortie(verdict)
  }

  deps.ecrire(
    `La Porte de fusion a dérivé : le ruleset « ${verdict.nom} » ne porte pas les faits du contrat « ${contrat.nom} ».`
  )
  for (const ecart of verdict.ecarts) {
    deps.ecrire(`  ${phraseDeLEcart(ecart)}`)
  }
  deps.ecrire(
    "Corrigez le ruleset vivant ou le contrat, puis relancez « npm run porte:verifier »."
  )
  return codeDeSortie(verdict)
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifierLaPorte()
    .then((code) => {
      process.exitCode = code
    })
    .catch((erreur: unknown) => {
      process.stderr.write(
        `La Porte de fusion n'est pas lisible : ${messageDe(erreur)}\n`
      )
      process.exitCode = 2
    })
}
