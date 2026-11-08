/**
 * PROTOTYPE (#964) — les trois lectures du Tableau de bord refiné, et la page
 * d'aujourd'hui comme référence. À jeter avec le reste de
 * `_prototype-tableau-de-bord/`.
 *
 * La charte est arrêtée (graphique ~260 px, liste des Commandes qui grandit et
 * gagne un pied, alertes à zéro masquées, montant plus petit que les comptes).
 * Les variantes ne rejouent donc pas l'architecture : elles tranchent les
 * quatre questions que le ticket a laissées ouvertes — le sort de la carte
 * « Stock faible », la forme du pied de la liste des Commandes, l'ordre de
 * l'empilement à 768 px, et le rythme commun des deux listes.
 */
export const VARIANTES = [
  { cle: "A", nom: "Le contrat" },
  { cle: "B", nom: "Le guichet" },
  { cle: "C", nom: "La bande" },
  { cle: "D", nom: "La retenue" },
] as const

export type CleVariante = (typeof VARIANTES)[number]["cle"]

export type ClePrototype = CleVariante | "reel"

export const VARIANTE_PAR_DEFAUT: CleVariante = "D"

export function estCleVariante(
  valeur: string | undefined
): valeur is CleVariante {
  return VARIANTES.some((variante) => variante.cle === valeur)
}

export function clePrototypeDepuis(valeur: string | undefined): ClePrototype {
  if (valeur === "reel") return "reel"
  return estCleVariante(valeur) ? valeur : VARIANTE_PAR_DEFAUT
}

export function nomDeLaVariante(cle: CleVariante): string {
  return VARIANTES.find((variante) => variante.cle === cle)!.nom
}
