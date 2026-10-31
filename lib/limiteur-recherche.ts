export const FENETRE_LIMITEUR_RECHERCHE_MS = 60_000

export const BUDGET_LIMITEUR_RECHERCHE = 60

export const MESSAGE_TROP_DE_RECHERCHES =
  "Trop de recherches en peu de temps — réessayez dans une minute."

export type VerdictLimiteur = "autorise" | "refuse"

export interface PortLimiteurRecherche {
  consommer(cle: string): Promise<VerdictLimiteur>
}

export interface OptionsLimiteurRecherche {
  fenetreMs?: number
  budget?: number
}

export class LimiteurRechercheIndisponibleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LimiteurRechercheIndisponibleError"
  }
}
