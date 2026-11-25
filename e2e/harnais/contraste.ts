import type { Locator } from "@playwright/test"

export function rapportDeContraste(texte: Locator): Promise<number> {
  return texte.evaluate((element) => {
    const toile = document.createElement("canvas")
    toile.width = 1
    toile.height = 1
    const contexte = toile.getContext("2d")
    if (contexte === null) throw new Error("le canevas 2D est indisponible")

    function lireUneCouleur(couleur: string): {
      canaux: [number, number, number]
      alpha: number
    } {
      contexte!.clearRect(0, 0, 1, 1)
      contexte!.fillStyle = "#000000"
      contexte!.fillStyle = couleur
      contexte!.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = contexte!.getImageData(0, 0, 1, 1).data
      return { canaux: [r, g, b], alpha: a / 255 }
    }

    function fondEffectif(depart: Element): [number, number, number] {
      const couches: { canaux: [number, number, number]; alpha: number }[] = []
      let noeud: Element | null = depart
      while (noeud !== null) {
        const couleur = lireUneCouleur(getComputedStyle(noeud).backgroundColor)
        if (couleur.alpha > 0) {
          couches.push(couleur)
          if (couleur.alpha >= 1) break
        }
        noeud = noeud.parentElement
      }

      let fond: [number, number, number] = [255, 255, 255]
      for (const couche of couches.reverse()) {
        fond = [
          Math.round(
            couche.alpha * couche.canaux[0] + (1 - couche.alpha) * fond[0]
          ),
          Math.round(
            couche.alpha * couche.canaux[1] + (1 - couche.alpha) * fond[1]
          ),
          Math.round(
            couche.alpha * couche.canaux[2] + (1 - couche.alpha) * fond[2]
          ),
        ]
      }
      return fond
    }

    function luminance([r, g, b]: [number, number, number]): number {
      const canal = (valeur: number): number => {
        const proportion = valeur / 255
        return proportion <= 0.04045
          ? proportion / 12.92
          : ((proportion + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.7152 * canal(b)
    }

    const couleurDuTexte = lireUneCouleur(getComputedStyle(element).color)
    const luminanceDuTexte = luminance(couleurDuTexte.canaux)
    const luminanceDuFond = luminance(fondEffectif(element))
    const [claire, sombre] =
      luminanceDuTexte > luminanceDuFond
        ? [luminanceDuTexte, luminanceDuFond]
        : [luminanceDuFond, luminanceDuTexte]

    return (claire + 0.05) / (sombre + 0.05)
  })
}
