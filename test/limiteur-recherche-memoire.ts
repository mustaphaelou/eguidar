import {
  BUDGET_LIMITEUR_RECHERCHE,
  FENETRE_LIMITEUR_RECHERCHE_MS,
  LimiteurRechercheIndisponibleError,
  type OptionsLimiteurRecherche,
  type PortLimiteurRecherche,
  type VerdictLimiteur,
} from "@/lib/limiteur-recherche"

export interface OptionsLimiteurMemoire extends OptionsLimiteurRecherche {
  maintenant?: () => number
}

interface Fenetre {
  compte: number
  expireA: number
}

export interface LimiteurRechercheMemoire extends PortLimiteurRecherche {
  readonly pannes: Set<"consommer">
  readonly fenetres: Map<string, Fenetre>
}

export function creerLimiteurRechercheMemoire(
  options: OptionsLimiteurMemoire = {}
): LimiteurRechercheMemoire {
  const fenetreMs = options.fenetreMs ?? FENETRE_LIMITEUR_RECHERCHE_MS
  const budget = options.budget ?? BUDGET_LIMITEUR_RECHERCHE
  const maintenant = options.maintenant ?? (() => Date.now())
  const fenetres = new Map<string, Fenetre>()
  const pannes = new Set<"consommer">()

  return {
    pannes,
    fenetres,
    async consommer(cle: string): Promise<VerdictLimiteur> {
      if (pannes.has("consommer")) {
        throw new LimiteurRechercheIndisponibleError(
          "limiteur de Recherche en mémoire en panne"
        )
      }

      const instant = maintenant()
      const fenetre = fenetres.get(cle)
      if (!fenetre || fenetre.expireA <= instant) {
        fenetres.set(cle, { compte: 1, expireA: instant + fenetreMs })
        return "autorise"
      }

      fenetre.compte += 1
      return fenetre.compte <= budget ? "autorise" : "refuse"
    },
  }
}
