import { expect } from "vitest"

import type {
  OptionsLimiteurRecherche,
  PortLimiteurRecherche,
} from "@/lib/limiteur-recherche"

export type EtatLimiteur = "sain" | "en-panne"

export type AdaptateurLimiteur = (
  etat: EtatLimiteur,
  options: OptionsLimiteurRecherche
) => PortLimiteurRecherche

export interface ContexteLimiteur {
  readonly cle: string
  readonly autreCle: string
  readonly fenetreMs: number
  readonly budget: number
}

export interface ScenarioLimiteur {
  readonly nom: string
  readonly etat?: EtatLimiteur
  jouer(
    limiteur: PortLimiteurRecherche,
    contexte: ContexteLimiteur
  ): Promise<unknown>
}

async function attendre(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export const SCENARIOS_LIMITEUR: readonly ScenarioLimiteur[] = [
  {
    nom: "laisse passer le budget puis refuse la requête suivante",
    async jouer(limiteur, { cle, budget }) {
      const verdicts: string[] = []
      for (let i = 0; i < budget; i += 1) {
        verdicts.push(await limiteur.consommer(cle))
      }
      verdicts.push(await limiteur.consommer(cle))
      return verdicts
    },
  },
  {
    nom: "isole chaque client derrière sa propre clé",
    async jouer(limiteur, { cle, autreCle, budget }) {
      for (let i = 0; i < budget; i += 1) {
        await limiteur.consommer(cle)
      }
      return {
        clientDuBudget: await limiteur.consommer(cle),
        autreClient: await limiteur.consommer(autreCle),
      }
    },
  },
  {
    nom: "rouvre une fenêtre entière une fois la précédente écoulée",
    async jouer(limiteur, { cle, budget, fenetreMs }) {
      for (let i = 0; i < budget; i += 1) {
        await limiteur.consommer(cle)
      }
      const refuse = await limiteur.consommer(cle)
      await attendre(fenetreMs + 100)
      return { refuse, apresLaFenetre: await limiteur.consommer(cle) }
    },
  },
  {
    nom: "une panne du limiteur se signale par une erreur",
    etat: "en-panne",
    async jouer(limiteur, { cle }) {
      try {
        await limiteur.consommer(cle)
        return { leve: false }
      } catch {
        return { leve: true }
      }
    },
  },
]

export async function exigerAccordLimiteur(
  scenario: ScenarioLimiteur,
  adaptateurs: readonly AdaptateurLimiteur[],
  contexte: ContexteLimiteur
): Promise<unknown[]> {
  const observations: unknown[] = []
  for (const adaptateur of adaptateurs) {
    const limiteur = adaptateur(scenario.etat ?? "sain", contexte)
    observations.push(await scenario.jouer(limiteur, contexte))
  }
  for (const observation of observations.slice(1)) {
    expect(observation).toEqual(observations[0])
  }
  return observations
}
