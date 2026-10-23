// Contrat de la lecture HTTP du Panier, partagé par la route qui répond et par
// les surfaces clientes qui la consomment. Module neutre (ADR-0028) : ni
// directive, ni import, donc aucune valeur ne se transforme en traversant la
// frontière client/serveur.

export interface CompteurDuPanier {
  itemCount: number
}

export interface LigneDeLApercuDuPanier {
  productSlug: string
  productName: string
  variantName: string
  image: string | null
  quantity: number
  unitPrice: number
}

export type ApercuDuPanier =
  | { etat: "vide"; connecte: boolean }
  | { etat: "plein"; connecte: boolean; lignes: LigneDeLApercuDuPanier[] }
