const fragmentsSûrs = new WeakSet<object>()

declare const marqueHtmlSûr: unique symbol

export interface HtmlSûr {
  readonly html: string
  readonly [marqueHtmlSûr]: true
}

function estSûr(valeur: unknown): valeur is HtmlSûr {
  return (
    typeof valeur === "object" && valeur !== null && fragmentsSûrs.has(valeur)
  )
}

function échapper(valeur: string): string {
  return valeur
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function rendreValeur(valeur: unknown): string {
  if (valeur === null || valeur === undefined || typeof valeur === "boolean") {
    return ""
  }
  if (Array.isArray(valeur)) return valeur.map(rendreValeur).join("")
  if (estSûr(valeur)) return valeur.html
  if (typeof valeur === "string") return échapper(valeur)
  return échapper(String(valeur))
}

export function html(
  morceaux: TemplateStringsArray,
  ...valeurs: readonly unknown[]
): HtmlSûr {
  let sortie = morceaux[0] ?? ""
  for (let index = 0; index < valeurs.length; index += 1) {
    sortie += rendreValeur(valeurs[index]) + (morceaux[index + 1] ?? "")
  }
  const fragment = Object.freeze({ html: sortie }) as HtmlSûr
  fragmentsSûrs.add(fragment)
  return fragment
}
