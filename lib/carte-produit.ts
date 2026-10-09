export interface CarteProduit {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
  totalStock: number
  freeShipping: boolean
}

export interface FaitsCarteProduit {
  id: string
  name: string
  slug: string
  brand: string
  images: unknown
  minPrice: number
  totalStock?: number
  freeShipping?: boolean
}

export function projeterCarteProduit(
  faits: FaitsCarteProduit & { totalStock: number; freeShipping: boolean },
  options: { rupture: "montrer" }
): CarteProduit
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: "masquer" }
): CarteProduit | null
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: "montrer" | "masquer" }
): CarteProduit | null {
  if (options.rupture === "masquer" && faits.totalStock === 0) return null
  const images = Array.isArray(faits.images)
    ? faits.images.filter((i): i is string => typeof i === "string")
    : []
  return {
    id: faits.id,
    name: faits.name,
    slug: faits.slug,
    brand: faits.brand,
    image: images[0] ?? null,
    minPrice: faits.minPrice,
    totalStock: faits.totalStock ?? 0,
    freeShipping: faits.freeShipping ?? false,
  }
}

export function urlProduit(slug: string): string {
  return `/produit/${slug}`
}
