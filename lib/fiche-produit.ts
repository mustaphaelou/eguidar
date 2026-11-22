export interface FaitsDeFicheProduit {
  brand: string
  specs: Record<string, string>
  categoryName: string | null
  variants: readonly { name: string; stock: number }[]
  freeShipping: boolean
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
