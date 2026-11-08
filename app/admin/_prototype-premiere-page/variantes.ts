/**
 * PROTOTYPE (#963) — les trois lectures de la première page, et rien de plus.
 * À jeter avec le reste de `_prototype-premiere-page/`.
 */
export const VARIANTES = [
  { cle: "A", nom: "L’invitation" },
  { cle: "B", nom: "La mise en route" },
  { cle: "C", nom: "Les deux portes" },
] as const

export type CleVariante = (typeof VARIANTES)[number]["cle"]

export const VARIANTE_PAR_DEFAUT: CleVariante = "A"

export function estCleVariante(
  valeur: string | undefined
): valeur is CleVariante {
  return VARIANTES.some((variante) => variante.cle === valeur)
}

export function cleVarianteDepuis(valeur: string | undefined): CleVariante {
  return estCleVariante(valeur) ? valeur : VARIANTE_PAR_DEFAUT
}
