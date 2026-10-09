import type {
  MoteurRecherche,
  ReponseMoteur,
  RequeteMoteur,
} from "@/lib/moteur-recherche"

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
