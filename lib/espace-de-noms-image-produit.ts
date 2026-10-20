export const PREFIXE_IMAGES_PRODUIT = "products/"
export const PREFIXE_BROUILLONS_IMAGE_PRODUIT = `${PREFIXE_IMAGES_PRODUIT}brouillons/`

function cleEstSousLEspaceDeNoms(cle: string): boolean {
  return cle
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..")
}

export function cleDepuisUrlPublique(
  publicUrl: string,
  basePublique: string | null | undefined
): string | null {
  if (!basePublique) return null
  let url: URL
  let base: URL
  try {
    url = new URL(publicUrl)
    base = new URL(basePublique)
  } catch {
    return null
  }
  if (url.origin !== base.origin) return null
  const prefixe = base.pathname.replace(/\/$/, "")
  if (!url.pathname.startsWith(`${prefixe}/`)) return null
  const cleEncodee = url.pathname.slice(prefixe.length + 1)
  if (!cleEncodee) return null
  let cle: string
  try {
    cle = decodeURIComponent(cleEncodee)
  } catch {
    return null
  }
  return cleEstSousLEspaceDeNoms(cle) ? cle : null
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
