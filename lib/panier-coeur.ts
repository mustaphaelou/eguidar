import { prixVariante } from "@/lib/product-metrics"

export type MotifRefusPanier =
  "cap-atteinte" | "quantite-invalide" | "variante-inconnue" | "article-inconnu"

export type ResultatPanier =
  { ok: true } | { ok: false; motif: MotifRefusPanier; message: string }

export interface ArticleDuPanier {
  variantId: string
  variantName: string
  productId: string
  productName: string
  productSlug: string
  image: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  stock: number
  freeShipping: boolean
}

export interface DonneesPanier {
  lines: ArticleDuPanier[]
  subtotal: number
  itemCount: number
}

export interface ArticleStockePanier {
  variantId: string
  quantity: number
}

export interface StockagePanier {
  readonly capArticlesMax?: number
  readonly motifIdentifiantVide?: MotifRefusPanier

  lire(): Promise<DonneesPanier>
  compter(): Promise<number>
  lireArticlesStockes(): Promise<ArticleStockePanier[]>
  possedeArticle(variantId: string): Promise<boolean>
  ajouterQuantite(variantId: string, quantity: number): Promise<void>
  definirQuantite(variantId: string, quantity: number): Promise<void>
  retirerArticle(variantId: string): Promise<boolean>
}

export interface CataloguePanier {
  existe(variantId: string): Promise<boolean>
}

export interface PanierStore {
  lire(): Promise<DonneesPanier>
  compter(): Promise<number>
  ajouter(variantId: string, quantity: number): Promise<ResultatPanier>
  modifier(variantId: string, quantity: number): Promise<ResultatPanier>
  retirer(variantId: string): Promise<ResultatPanier>
}

const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

function messageDuRefus(motif: MotifRefusPanier, cap?: number): string {
  switch (motif) {
    case "cap-atteinte":
      return `Votre panier est plein : ${cap} articles maximum.`
    case "quantite-invalide":
      return MESSAGE_QUANTITE_INVALIDE
    case "variante-inconnue":
      return MESSAGE_VARIANTE_INCONNUE
    case "article-inconnu":
      return MESSAGE_ARTICLE_INCONNU
  }
}

function refusDuPanier(motif: MotifRefusPanier, cap?: number): ResultatPanier {
  return { ok: false, motif, message: messageDuRefus(motif, cap) }
}

export function quantiteValide(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1
}

export function creerPanierStore(
  stockage: StockagePanier,
  catalogue: CataloguePanier
): PanierStore {
  return {
    lire(): Promise<DonneesPanier> {
      return stockage.lire()
    },

    compter(): Promise<number> {
      return stockage.compter()
    },

    async ajouter(
      variantId: string,
      quantity: number
    ): Promise<ResultatPanier> {
      if (!quantiteValide(quantity)) {
        return refusDuPanier("quantite-invalide")
      }
      if (variantId.length === 0 && stockage.motifIdentifiantVide) {
        return refusDuPanier(stockage.motifIdentifiantVide)
      }
      if (!(await stockage.possedeArticle(variantId))) {
        const cap = stockage.capArticlesMax
        if (cap !== undefined) {
          const articles = await stockage.lireArticlesStockes()
          if (articles.length >= cap) {
            return refusDuPanier("cap-atteinte", cap)
          }
        }
      }
      if (!(await catalogue.existe(variantId))) {
        return refusDuPanier("variante-inconnue")
      }
      await stockage.ajouterQuantite(variantId, quantity)
      return { ok: true }
    },

    async modifier(
      variantId: string,
      quantity: number
    ): Promise<ResultatPanier> {
      if (!quantiteValide(quantity)) {
        return refusDuPanier("quantite-invalide")
      }
      if (!(await stockage.possedeArticle(variantId))) {
        return refusDuPanier("article-inconnu")
      }
      if (!(await catalogue.existe(variantId))) {
        return refusDuPanier("variante-inconnue")
      }
      await stockage.definirQuantite(variantId, quantity)
      return { ok: true }
    },

    async retirer(variantId: string): Promise<ResultatPanier> {
      if (!(await stockage.retirerArticle(variantId))) {
        return refusDuPanier("article-inconnu")
      }
      return { ok: true }
    },
  }
}

export interface VarianteAvecProduit {
  id: string
  name: string
  productId: string
  priceDelta: number
  stock: number
  product: {
    price: number
    name: string
    slug: string
    images: unknown
    freeShipping: boolean
  }
}

export function construireArticleDuPanier(
  variant: VarianteAvecProduit,
  quantity: number
): ArticleDuPanier {
  const unitPrice = prixVariante(variant.product.price, variant.priceDelta)
  return {
    variantId: variant.id,
    variantName: variant.name,
    productId: variant.productId,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    image: Array.isArray(variant.product.images)
      ? ((variant.product.images[0] as string | undefined) ?? null)
      : null,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    stock: variant.stock,
    freeShipping: variant.product.freeShipping,
  }
}

export function calculerTotauxPanier(
  articles: readonly ArticleDuPanier[]
): Pick<DonneesPanier, "subtotal" | "itemCount"> {
  return {
    subtotal: articles.reduce((somme, article) => somme + article.lineTotal, 0),
    itemCount: articles.reduce((somme, article) => somme + article.quantity, 0),
  }
}
