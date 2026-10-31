export interface CibleDeplacement {
  nouvelleParenteId: string | null
  avantId: string | null
}

export interface IntentionsDeplacement {
  monter: CibleDeplacement | null
  descendre: CibleDeplacement | null
  indenter: CibleDeplacement | null
  desindenter: CibleDeplacement | null
}

interface LigneOrdonnee {
  id: string
  parentId: string | null
  horsArbre: boolean
}

/**
 * Traduit l'ordre déjà rendu par la Lecture en une intention par geste. La page
 * ne calcule ni position ni ordre : elle lit la fratrie que la Lecture vient de
 * ranger, et nomme les deux voisines que la commande attend. Un déplacement
 * hors arbre n'a que « Rattacher… ».
 */
export function intentionsDeDeplacement(
  lignes: readonly LigneOrdonnee[]
): Map<string, IntentionsDeplacement> {
  const dansLArbre = lignes.filter((ligne) => !ligne.horsArbre)
  const fratries = new Map<string, string[]>()
  for (const ligne of dansLArbre) {
    const cle = ligne.parentId ?? ""
    const fratrie = fratries.get(cle)
    if (fratrie) fratrie.push(ligne.id)
    else fratries.set(cle, [ligne.id])
  }

  const parId = new Map(dansLArbre.map((ligne) => [ligne.id, ligne]))
  const intentions = new Map<string, IntentionsDeplacement>()

  for (const ligne of dansLArbre) {
    const fratrie = fratries.get(ligne.parentId ?? "") ?? []
    const rang = fratrie.indexOf(ligne.id)
    const precedente = rang > 0 ? (fratrie[rang - 1] ?? null) : null
    const suivante =
      rang >= 0 && rang < fratrie.length - 1
        ? (fratrie[rang + 1] ?? null)
        : null
    const apresSuivante =
      rang >= 0 && rang < fratrie.length - 2
        ? (fratrie[rang + 2] ?? null)
        : null

    const parente =
      ligne.parentId === null ? null : (parId.get(ligne.parentId) ?? null)
    const fratrieDeLaParente = parente
      ? (fratries.get(parente.parentId ?? "") ?? [])
      : []
    const rangDeLaParente = parente
      ? fratrieDeLaParente.indexOf(parente.id)
      : -1
    const suivanteDeLaParente =
      rangDeLaParente >= 0 && rangDeLaParente < fratrieDeLaParente.length - 1
        ? (fratrieDeLaParente[rangDeLaParente + 1] ?? null)
        : null

    intentions.set(ligne.id, {
      monter: precedente
        ? { nouvelleParenteId: ligne.parentId, avantId: precedente }
        : null,
      descendre: suivante
        ? { nouvelleParenteId: ligne.parentId, avantId: apresSuivante }
        : null,
      indenter: precedente
        ? { nouvelleParenteId: precedente, avantId: null }
        : null,
      desindenter: parente
        ? {
            nouvelleParenteId: parente.parentId,
            avantId: suivanteDeLaParente,
          }
        : null,
    })
  }

  for (const ligne of lignes) {
    if (intentions.has(ligne.id)) continue
    intentions.set(ligne.id, {
      monter: null,
      descendre: null,
      indenter: null,
      desindenter: null,
    })
  }

  return intentions
}
