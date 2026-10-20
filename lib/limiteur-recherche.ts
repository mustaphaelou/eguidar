export const FENETRE_LIMITEUR_RECHERCHE_MS = 60_000

export const BUDGET_LIMITEUR_RECHERCHE = 60

export const MESSAGE_TROP_DE_RECHERCHES =
  "Trop de recherches en peu de temps — réessayez dans une minute."

export const ADRESSE_CLIENT_PARTAGEE = "client-partage"

export type VerdictLimiteur = "autorise" | "refuse"

export interface PortLimiteurRecherche {
  consommer(cle: string): Promise<VerdictLimiteur>
}

export interface OptionsLimiteurRecherche {
  fenetreMs?: number
  budget?: number
}

export interface EntetesRequete {
  get(nom: string): string | null
}

export class LimiteurRechercheIndisponibleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LimiteurRechercheIndisponibleError"
  }
}

export function adresseClient(entetes: EntetesRequete): string {
  const cloudflare = entetes.get("cf-connecting-ip")?.trim()
  if (cloudflare) return cloudflare
  const reelle = entetes.get("x-real-ip")?.trim()
  if (reelle) return reelle
  const transmise = entetes.get("x-forwarded-for")?.split(",").at(-1)?.trim()
  if (transmise) return transmise
  return ADRESSE_CLIENT_PARTAGEE
}
