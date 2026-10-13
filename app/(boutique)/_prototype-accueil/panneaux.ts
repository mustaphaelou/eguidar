/**
 * Prototype : la copie et l'inventaire des panneaux.
 *
 * Le code possède le dessin de chaque panneau ; la copie est écrite à la main, indexée par
 * slug, avec un repli (nom / marque / prix) pour un produit sans copie. C'est l'appel
 * provisoire de #641 — les produits mis en avant de l'Administration (`featuredOrder`) donnent
 * la liste et l'ordre, le code donne la copie.
 *
 * Le PlayStation 5 Slim n'a volontairement pas de copie : c'est le repli, en vrai.
 */

import { formatPrice } from "@/lib/money"
import { urlProduit, type CarteProduit } from "@/lib/carte-produit"
import type { NoeudAccueil } from "@/lib/use-cases/lecture-structure"

export interface Histoire {
  produit: CarteProduit
  href: string
  titre: string
  surtitre: string
  callout: string
  /** faux = panneau de repli : nom, marque et prix, sans copie écrite. */
  copie: boolean
}

export interface DonneesAccueil {
  categories: NoeudAccueil[]
  histoires: Histoire[]
}

interface CopiePanneau {
  surtitre: string
}

const COPIES: Record<string, CopiePanneau> = {
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

/** Le callout d'un panneau : le prix d'abord, et la livraison offerte quand elle l'est. */
export function calloutDuProduit(produit: CarteProduit): string {
  const prix = `Dès ${formatPrice(produit.minPrice)}`
  return produit.freeShipping ? `${prix} · Livraison offerte` : prix
}

export function histoireDuProduit(produit: CarteProduit): Histoire {
  const copie = COPIES[produit.slug]
  return {
    produit,
    href: urlProduit(produit.slug),
    titre: produit.name,
    surtitre: copie?.surtitre ?? produit.brand,
    callout: calloutDuProduit(produit),
    copie: Boolean(copie),
  }
}

export function histoiresDepuis(featured: CarteProduit[]): Histoire[] {
  return featured.map(histoireDuProduit)
}

export function donneesDepuis(donnees: {
  categories: NoeudAccueil[]
  featured: CarteProduit[]
}): DonneesAccueil {
  return {
    categories: donnees.categories,
    histoires: histoiresDepuis(donnees.featured),
  }
}

/** La bande des catégories : son titre, et le libellé de chaque entrée. */
export const BANDE_CATEGORIES = {
  titre: "Toutes nos catégories",
  surtitre: "Du smartphone à l'accessoire, tout est là.",
  cta: "Découvrir",
} as const

export function decompte(noeud: NoeudAccueil): string {
  return `${noeud.productCount} produit${noeud.productCount > 1 ? "s" : ""}`
}
