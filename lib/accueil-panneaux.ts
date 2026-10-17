import { urlProduit, type CarteProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"
import type { NoeudAccueil } from "@/lib/use-cases/lecture-structure"

export interface PanneauProduit {
  produit: CarteProduit
  href: string
  titre: string
  surtitre: string
  callout: string
}

const COPIES: Record<string, { surtitre: string }> = {
  "iphone-15-pro": {
    surtitre: "Le titane, la puce A17 Pro, et un zoom ×5.",
  },
  "samsung-galaxy-s24-ultra": {
    surtitre: "Le S Pen, et un zoom qui va jusqu'à 100×.",
  },
  "macbook-air-13-m3": {
    surtitre: "Une journée d'autonomie, dans 1,24 kg.",
  },
  "sony-wh-1000xm5": {
    surtitre: "Le bruit s'efface. Il ne reste que la musique.",
  },
  "tv-lg-oled-65-c4": {
    surtitre: "Le noir absolu, à la maison.",
  },
}

export function calloutDuProduit(produit: CarteProduit): string {
  const prix = `Dès ${formatPrice(produit.minPrice)}`
  return produit.freeShipping ? `${prix} · Livraison offerte` : prix
}

export function projeterPanneau(produit: CarteProduit): PanneauProduit {
  const copie = COPIES[produit.slug]
  return {
    produit,
    href: urlProduit(produit.slug),
    titre: produit.name,
    surtitre: copie?.surtitre ?? produit.brand,
    callout: calloutDuProduit(produit),
  }
}

export function projeterPanneaux(produits: CarteProduit[]): PanneauProduit[] {
  return produits.map(projeterPanneau)
}

export const BANDE_CATEGORIES = {
  titre: "Toutes nos catégories",
  surtitre: "Du smartphone à l'accessoire, tout est là.",
  cta: "Découvrir",
} as const

export function decompteDesProduits(noeud: NoeudAccueil): string {
  return `${noeud.productCount} produit${noeud.productCount > 1 ? "s" : ""}`
}

export function parPaires<T>(items: T[]): T[][] {
  const rangees: T[][] = []
  for (let i = 0; i < items.length; i += 2) {
    rangees.push(items.slice(i, i + 2))
  }
  return rangees
}
