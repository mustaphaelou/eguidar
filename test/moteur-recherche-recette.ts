import type {
  MoteurRecherche,
  ReponseMoteur,
  RequeteMoteur,
} from "@/lib/moteur-recherche"

/**
 * Le moteur de recette : un Moteur de recherche qui répond une réponse figée
 * et retient chaque requête qu'on lui remet. Il sert aux cas d'indisponibilité,
 * où ni Meili ni l'engin en mémoire n'ont leur mot à dire : seul compte ce que
 * l'orchestration lui demande, et ce qu'elle cesse de lui demander une fois la
 * réponse lue.
 */
export function creerMoteurRecette(
  reponse: ReponseMoteur
): MoteurRecherche & { requetes: RequeteMoteur[] } {
  const requetes: RequeteMoteur[] = []
  return {
    requetes,
    async chercher(requete: RequeteMoteur): Promise<ReponseMoteur> {
      requetes.push(requete)
      return reponse
    },
  }
}

export function creerMoteurIndisponible(): MoteurRecherche & {
  requetes: RequeteMoteur[]
} {
  return creerMoteurRecette({ statut: "indisponible" })
}
