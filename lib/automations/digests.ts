import type { IndexableProduct } from "@/lib/index-projection"
import { formatPrice } from "@/lib/money"

export interface LigneStockBas {
  produit: string
  variante: string
  sku: string
  stock: number
}

function comparerTextes(a: string, b: string): number {
  return a.localeCompare(b, "fr") || a.localeCompare(b)
}

function estRemplie(ligne: LigneStockBas): boolean {
  return ligne.produit.trim() !== "" && ligne.sku.trim() !== ""
}

/**
 * Le digest du stock bas est une projection pure : la même journée et les
 * mêmes variantes donnent exactement le même texte, quel que soit l'ordre de
 * lecture de la base. C'est ce qui rend le rejeu d'une journée inoffensif.
 */
export function construireDigestStockBas(entree: {
  jour: string
  seuil: number
  lignes: readonly LigneStockBas[]
}): string {
  const lignes = [...entree.lignes]
    .filter(estRemplie)
    .sort(
      (a, b) =>
        comparerTextes(a.produit, b.produit) ||
        comparerTextes(a.variante, b.variante) ||
        comparerTextes(a.sku, b.sku)
    )

  const entete = `Stock bas du ${entree.jour} (seuil ${entree.seuil})`
  if (lignes.length === 0) return `${entete} : aucune variante.`

  const corps = lignes.map((ligne) => {
    const reste = ligne.stock > 1 ? "restants" : "restant"
    return `- « ${ligne.produit} » — ${ligne.variante} (${ligne.sku}) : ${ligne.stock} ${reste}`
  })
  return [`${entete} : ${lignes.length} variante(s).`, ...corps].join("\n")
}

export interface FaitsDigestProprietaire {
  jour: string
  produitCount: number
  commandeEnAttente: number
  caEncaisse30j: number
  stockBas: number
}

export function construireDigestProprietaire(
  faits: FaitsDigestProprietaire
): string {
  return [
    `Tableau de bord du ${faits.jour}`,
    `- Produits : ${faits.produitCount}`,
    `- Commandes en attente : ${faits.commandeEnAttente}`,
    `- Encaissé sur 30 jours : ${formatPrice(faits.caEncaisse30j)}`,
    `- Variantes en stock bas : ${faits.stockBas}`,
  ].join("\n")
}

export interface RapportReconciliation {
  texte: string
  aReecrire: IndexableProduct[]
  aRetirer: string[]
}

/**
 * La réconciliation compare la base et l'index par identifiant et par
 * `updatedAt` : un document absent ou périmé est réécrit, un document orphelin
 * est retiré. Le rapport est trié par identifiant pour être stable et
 * rejouable — le second passage d'une même journée ne trouve plus rien.
 */
export function construireReconciliation(entree: {
  jour: string
  produits: readonly IndexableProduct[]
  documents: readonly IndexableProduct[]
}): RapportReconciliation {
  const parId = new Map(
    entree.documents.map((document) => [document.id, document])
  )
  const idsBase = new Set(entree.produits.map((produit) => produit.id))

  const aReecrire = entree.produits
    .filter((produit) => {
      const document = parId.get(produit.id)
      return !document || document.updatedAt !== produit.updatedAt
    })
    .sort((a, b) => comparerTextes(a.id, b.id))

  const aRetirer = entree.documents
    .filter((document) => !idsBase.has(document.id))
    .map((document) => document.id)
    .sort(comparerTextes)

  const entete = `Réconciliation du ${entree.jour}`
  const lignes = [
    `${entete} : ${aReecrire.length} à réécrire, ${aRetirer.length} à retirer.`,
  ]
  if (aReecrire.length > 0) {
    lignes.push(
      ...aReecrire.map(
        (produit) => `- à réécrire : ${produit.id} (${produit.name})`
      )
    )
  }
  if (aRetirer.length > 0) {
    lignes.push(...aRetirer.map((id) => `- à retirer : ${id}`))
  }
  return { texte: lignes.join("\n"), aReecrire, aRetirer }
}
