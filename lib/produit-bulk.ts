/**
 * Le vocabulaire partagé par les gestes en lot de la Liste des Produits : le
 * contrat du rapport qui remonte au client, et la lecture du FormData qui porte
 * les identifiants. Le module est neutre — les Server Actions le lisent, le
 * tableau client l'affiche.
 */

export interface EchecLot {
  id: string
  raison: string
}

export const CHAMP_IDS_LOT = "ids"
export const CHAMP_VALEUR_LOT = "valeur"
export const CHAMP_STRUCTURE_LOT = "structureId"

export const MESSAGE_FORMULAIRE_LOT_INVALIDE = "Formulaire invalide"

export function parseIdentifiantsLot(formData: FormData): string[] {
  const brut = formData.get(CHAMP_IDS_LOT)
  if (typeof brut !== "string" || brut.trim() === "") return []
  let valeurs: unknown
  try {
    valeurs = JSON.parse(brut)
  } catch {
    throw new Error(MESSAGE_FORMULAIRE_LOT_INVALIDE)
  }
  if (!Array.isArray(valeurs)) throw new Error(MESSAGE_FORMULAIRE_LOT_INVALIDE)
  return [
    ...new Set(
      valeurs.filter(
        (valeur): valeur is string =>
          typeof valeur === "string" && valeur !== ""
      )
    ),
  ]
}

export function parseValeurLot(formData: FormData): boolean {
  return formData.get(CHAMP_VALEUR_LOT) === "1"
}

export function parseStructureLot(formData: FormData): string {
  const valeur = String(formData.get(CHAMP_STRUCTURE_LOT) ?? "")
  if (valeur === "") throw new Error(MESSAGE_FORMULAIRE_LOT_INVALIDE)
  return valeur
}

export interface RapportLot {
  succes: string[]
  echecs: EchecLot[]
}

/** La phrase qu'annonce la région polie après un geste en lot. */
export function messageDuRapport(rapport: RapportLot): string {
  const nombre = rapport.succes.length
  const succes = `${nombre} produit${nombre > 1 ? "s" : ""} ${nombre > 1 ? "ont" : "a"} été traité${nombre > 1 ? "s" : ""}`
  if (rapport.echecs.length === 0) return succes
  const raisons = [...new Set(rapport.echecs.map((echec) => echec.raison))]
  const echecs = rapport.echecs.length
  return `${succes} ; ${echecs} échec${echecs > 1 ? "s" : ""} : ${raisons.join(", ")}`
}
