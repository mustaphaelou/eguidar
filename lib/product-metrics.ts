export interface VariantPriceAndStock {
  priceDelta: number
  stock: number
}

export function prixVariante(basePrice: number, priceDelta: number): number {
  return basePrice + priceDelta
}

export function minVariantPrice(
  basePrice: number,
  variants: VariantPriceAndStock[]
): number {
  return variants.reduce(
    (min, variant) =>
      Math.min(min, prixVariante(basePrice, variant.priceDelta)),
    basePrice
  )
}

/**
 * Le stock total d'un Produit : la somme des stocks de ses Variantes.
 *
 * Le paramètre est le plus petit type structurel que la somme lit — un tableau
 * de `{ stock }` — et non `VariantPriceAndStock[]`, que cette fonction ne ferait
 * qu'exiger par accident. L'écart de prix appartient à `prixVariante` et
 * `minVariantPrice`, qui, eux, ont besoin des deux colonnes. Un appelant dont
 * la requête ne remplit que le stock n'a donc plus à en sélectionner un de trop
 * pour satisfaire cette règle : c'est ce qui permet à une lecture de ne payer
 * que la colonne qu'elle compose.
 */
export function totalVariantStock(
  variants: readonly { stock: number }[]
): number {
  return variants.reduce((sum, variant) => sum + variant.stock, 0)
}

/**
 * Les URL des Images produit d'un Produit, telles que sa colonne `images`
 * les garde.
 *
 * La colonne est un `Json` sans forme garantie : une galerie stockée qui
 * n'est pas un tableau — un objet, une chaîne, un nombre, `null` — ne
 * décrit aucune Image produit et répond donc la liste vide. Un tableau dont
 * certains membres ne sont pas des chaînes est une galerie à moitié écrite :
 * les URL lisibles survivent, les autres sont abandonnées — la règle que la
 * Carte produit et le Document d'index appliquent déjà dans leurs propres
 * copies (ADR-0013, ADR-0022) et que cette fonction ne remplace pas.
 *
 * Une colonne mal formée ne lève jamais : un Produit abimé doit pouvoir
 * s'afficher sans image plutôt que faire tomber l'écran qui le rend.
 */
export function urlsImagesProduit(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string")
    : []
}

/**
 * Les spécifications d'un Produit, telles que sa colonne `specs` les garde.
 *
 * La colonne est un `Json` sans forme garantie : seule une série d'entrées
 * dont *toutes* les valeurs sont des chaînes est un enregistrement de
 * spécifications — la forme que le Catalogue écrit et valide. Tout le
 * reste répond l'enregistrement vide : un tableau, une chaîne, un nombre,
 * `null`, et jusqu'à une série dont une seule valeur n'est pas une chaîne,
 * car une valeur illisible contamine la forme de toutes les autres et il
 * vaut mieux rendre un champ vide qu'un lot à moitié crédible — l'éditeur
 * le resaisit, la page ne casse pas.
 */
export function specificationsProduit(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const specifications: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(value)) {
    if (typeof valeur !== "string") return {}
    specifications[cle] = valeur
  }
  return specifications
}
