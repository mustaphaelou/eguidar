export interface LienRendu {
  /** La balise ouvrante, attributs compris. */
  balise: string
  /** Le texte visible du lien, balises internes retirées. */
  texte: string
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Les liens rendus qui pointent vers `href`, dans l'ordre du document. */
export function liensVers(html: string, href: string): LienRendu[] {
  const motif = new RegExp(
    `<a[^>]*href="${echapper(href)}"[^>]*>([\\s\\S]*?)</a>`,
    "g"
  )
  return [...html.matchAll(motif)].map((correspondance) => ({
    balise: correspondance[0]!.slice(0, correspondance[0]!.indexOf(">") + 1),
    texte: correspondance[1]!.replace(/<[^>]*>/g, "").trim(),
  }))
}
