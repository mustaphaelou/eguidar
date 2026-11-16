export interface LienRendu {
  balise: string
  texte: string
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

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
