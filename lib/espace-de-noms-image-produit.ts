export const PREFIXE_IMAGES_PRODUIT = "products/"
export const PREFIXE_BROUILLONS_IMAGE_PRODUIT = `${PREFIXE_IMAGES_PRODUIT}brouillons/`

export function cleDepuisUrlPublique(
  publicUrl: string,
  basePublique: string | null | undefined
): string | null {
  if (!basePublique) return null
  const base = basePublique.replace(/\/$/, "")
  if (!base || !publicUrl.startsWith(`${base}/`)) return null
  const cleEncodee = publicUrl.slice(base.length + 1)
  if (!cleEncodee) return null
  try {
    return decodeURIComponent(cleEncodee)
  } catch {
    return null
  }
}

function estCleImageProduitPersistee(cle: string): boolean {
  return (
    cle.startsWith(PREFIXE_IMAGES_PRODUIT) &&
    !cle.startsWith(PREFIXE_BROUILLONS_IMAGE_PRODUIT)
  )
}

export function cleImageProduitPersistee(
  publicUrl: string,
  basePublique: string | null | undefined
): string | null {
  const cle = cleDepuisUrlPublique(publicUrl, basePublique)
  return cle !== null && estCleImageProduitPersistee(cle) ? cle : null
}

export function estUrlImageProduitPersistee(
  publicUrl: string,
  basePublique: string | null | undefined
): boolean {
  return cleImageProduitPersistee(publicUrl, basePublique) !== null
}
