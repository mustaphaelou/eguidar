export const PREFIXE_DETAIL_PRODUIT = "product:"
export const PREFIXE_DETAIL_CATEGORIE = "category:"
export const PREFIXE_DETAIL_BLOG = "blog:"

export const PREFIXES_DETAIL = [
  PREFIXE_DETAIL_PRODUIT,
  PREFIXE_DETAIL_CATEGORIE,
  PREFIXE_DETAIL_BLOG,
]

export function estTagDeDetail(tag) {
  return (
    typeof tag === "string" &&
    PREFIXES_DETAIL.some((prefixe) => tag.startsWith(prefixe))
  )
}
