import { formatPrice } from "@/lib/money"

export interface FaitsDeFicheProduit {
  name: string
  brand: string
  description: string
  specs: Record<string, string>
  categoryName: string | null
  variants: readonly { name: string; prix: number; stock: number }[]
  minPrice: number
  freeShipping: boolean
}

function nomAvecSaMarque(faits: FaitsDeFicheProduit): string {
  const marque = faits.brand.trim()
  if (marque.length === 0) return faits.name
  if (faits.name.toLowerCase().includes(marque.toLowerCase())) return faits.name
  return `${faits.name} (${marque})`
}

function joindreLesNoms(noms: string[]): string {
  if (noms.length <= 1) return noms[0] ?? ""
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`
}

function phraseDesVariantes(faits: FaitsDeFicheProduit): string {
  const noms = faits.variants
    .map((variante) => variante.name.trim())
    .filter((nom) => nom.length > 0)
  if (noms.length <= 1) return "Il est proposé en un seul modèle."
  return `Il est disponible en ${noms.length} déclinaisons : ${joindreLesNoms(noms)}.`
}

function phraseDuStock(faits: FaitsDeFicheProduit): string {
  const disponible = faits.variants.some((variante) => variante.stock > 0)
  return disponible
    ? "Il est disponible dès maintenant."
    : "Il est actuellement en rupture de stock."
}

function phraseDeLachat(faits: FaitsDeFicheProduit): string {
  return faits.freeShipping
    ? "La livraison est offerte, paiement à la livraison."
    : "Le paiement se fait à la livraison, avec des frais de livraison selon la ville."
}

export function descriptionAffichee(faits: FaitsDeFicheProduit): string {
  const ecrite = faits.description.trim()
  if (ecrite.length > 0) return ecrite

  const rayon =
    faits.categoryName === null
      ? "de notre catalogue"
      : `de notre rayon ${faits.categoryName}`

  return [
    `${nomAvecSaMarque(faits)} est un produit ${rayon}.`,
    phraseDesVariantes(faits),
    `Son prix commence à ${formatPrice(faits.minPrice)}, TVA 20 % incluse.`,
    phraseDuStock(faits),
    phraseDeLachat(faits),
  ].join(" ")
}

export function specificationsAffichees(
  faits: FaitsDeFicheProduit
): [string, string][] {
  const specifications = new Map<string, string>(Object.entries(faits.specs))

  const faitsDeBase: [string, string][] = [
    ["Marque", faits.brand],
    ["Catégorie", faits.categoryName ?? ""],
    [
      "Déclinaisons",
      faits.variants
        .map((variante) => variante.name.trim())
        .filter((nom) => nom.length > 0)
        .join(" · "),
    ],
    [
      "Disponibilité",
      faits.variants.some((variante) => variante.stock > 0)
        ? "En stock"
        : "Rupture de stock",
    ],
    ["Livraison", faits.freeShipping ? "Offerte" : "Selon la ville"],
  ]

  for (const [label, valeur] of faitsDeBase) {
    if (valeur.trim().length === 0) continue
    if (specifications.has(label)) continue
    specifications.set(label, valeur)
  }

  return [...specifications.entries()]
}
