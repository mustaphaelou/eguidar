export interface CompteurDuPanier {
  itemCount: number
}

export interface ArticleDeLApercuDuPanier {
  productSlug: string
  productName: string
  variantName: string
  image: string | null
  quantity: number
  unitPrice: number
}

export type ApercuDuPanier =
  | { etat: "vide"; connecte: boolean }
  | { etat: "plein"; connecte: boolean; lignes: ArticleDeLApercuDuPanier[] }
