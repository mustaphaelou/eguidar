export type FragmentArticle =
  | { type: "paragraphe"; texte: string }
  | { type: "intertitre"; texte: string }
  | { type: "figure"; alt: string; url: string; legende: string | null }
  | { type: "liste"; items: string[] }
  | { type: "citation"; texte: string }

const FIGURE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/

export function decoupeContenuArticle(contenu: string): FragmentArticle[] {
  const fragments: FragmentArticle[] = []
  const lignes = contenu.replace(/\r\n?/g, "\n").split("\n")
  let paragraphe: string[] = []
  let listeCourante: { type: "liste"; items: string[] } | null = null

  function viderParagraphe() {
    const texte = paragraphe.join("\n").trim()
    if (texte.length > 0) fragments.push({ type: "paragraphe", texte })
    paragraphe = []
  }

  for (const ligne of lignes) {
    const coupee = ligne.trim()

    if (coupee.length === 0) {
      viderParagraphe()
      listeCourante = null
      continue
    }

    if (coupee === "##" || coupee.startsWith("## ")) {
      viderParagraphe()
      listeCourante = null
      const texte = coupee.slice(2).trim()
      if (texte.length > 0) fragments.push({ type: "intertitre", texte })
      continue
    }

    if (coupee.startsWith("- ")) {
      viderParagraphe()
      const item = coupee.slice(2).trim()
      if (item.length > 0) {
        if (listeCourante) {
          listeCourante.items.push(item)
        } else {
          listeCourante = { type: "liste", items: [item] }
          fragments.push(listeCourante)
        }
      }
      continue
    }

    if (coupee.startsWith("> ")) {
      viderParagraphe()
      listeCourante = null
      const texte = coupee.slice(2).trim()
      if (texte.length > 0) fragments.push({ type: "citation", texte })
      continue
    }

    const figure = coupee.match(FIGURE)
    if (figure) {
      viderParagraphe()
      listeCourante = null
      fragments.push({
        type: "figure",
        alt: figure[1],
        url: figure[2],
        legende: figure[3] ? figure[3] : null,
      })
      continue
    }

    listeCourante = null
    paragraphe.push(ligne)
  }

  viderParagraphe()
  return fragments
}

export function lignesDeNotes(notes: string | null): string[] {
  if (notes === null) return []
  return notes
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0)
}

export type MorceauDeTexte =
  { type: "texte"; texte: string } | { type: "renvoi"; numero: number }

const RENVOI = /\^([1-9]\d*)/g

export function decoupeRenvoisDeNote(
  texte: string,
  nombreDeNotes: number
): MorceauDeTexte[] {
  const morceaux: MorceauDeTexte[] = []
  let dernier = 0

  for (const correspondance of texte.matchAll(RENVOI)) {
    const numero = Number(correspondance[1])
    if (numero > nombreDeNotes) continue

    const debut = correspondance.index
    if (debut > dernier)
      morceaux.push({ type: "texte", texte: texte.slice(dernier, debut) })
    morceaux.push({ type: "renvoi", numero })
    dernier = debut + correspondance[0].length
  }

  if (dernier < texte.length)
    morceaux.push({ type: "texte", texte: texte.slice(dernier) })

  return morceaux.length > 0 ? morceaux : [{ type: "texte", texte }]
}
