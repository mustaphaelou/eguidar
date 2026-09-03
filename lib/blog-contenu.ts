export type BlocContenuArticle =
  | { type: "titre-section"; texte: string }
  | { type: "paragraphe"; texte: string }

/**
 * Découpe le contenu plaintext d'un Article de blog en blocs.
 * Une ligne commençant par `## ` devient un titre de section (H2),
 * les autres blocs séparés par des lignes blanches restent des paragraphes.
 * Sécurité : plaintext uniquement, rendu via nœuds texte React (pas de HTML).
 */
export function decoupeContenuArticle(contenu: string): BlocContenuArticle[] {
  const blocs: BlocContenuArticle[] = []
  const morceaux = contenu.split(/\n{2,}/)
  for (const morceau of morceaux) {
    const lignes = morceau.split("\n")
    let paragrapheCourant: string[] = []
    const viderParagraphe = () => {
      const texte = paragrapheCourant.join("\n").trim()
      if (texte.length > 0) blocs.push({ type: "paragraphe", texte })
      paragrapheCourant = []
    }
    for (const ligne of lignes) {
      const coupee = ligne.trim()
      if (coupee === "##" || coupee.startsWith("## ")) {
        viderParagraphe()
        const texte = coupee === "##" ? "" : coupee.slice(3).trim()
        if (texte.length > 0) blocs.push({ type: "titre-section", texte })
      } else if (coupee.length === 0) {
        viderParagraphe()
      } else {
        paragrapheCourant.push(ligne)
      }
    }
    viderParagraphe()
  }
  return blocs
}

export function aDesSectionsArticle(contenu: string): boolean {
  return decoupeContenuArticle(contenu).some(
    (bloc) => bloc.type === "titre-section"
  )
}
