/**
 * Prototype : les trois variantes de la mosaïque, et leurs noms dans la barre de bas d'écran.
 */

export const VARIANTES = [
  { cle: "A", nom: "La pile" },
  { cle: "B", nom: "Le mur" },
  { cle: "C", nom: "L'index" },
] as const

export type CleVariante = (typeof VARIANTES)[number]["cle"]

export const VARIANTE_PAR_DEFAUT: CleVariante = "A"

export function estCleVariante(
  valeur: string | undefined
): valeur is CleVariante {
  return VARIANTES.some((variante) => variante.cle === valeur)
}
