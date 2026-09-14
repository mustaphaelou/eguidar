/**
 * Cœur pur du Panier — module neutre, sans directive.
 *
 * NE JAMAIS ajouter `"use client"` ici : les entrées publiques du Panier
 * sont des Server Actions et des lectures de page serveur (`@/lib/panier`,
 * `app/(boutique)/actions.ts`).
 *
 * NE JAMAIS importer `@/lib/db` (ni aucun module qui l'importe), ni
 * `next/headers`, ni `server-only` ici : ce cœur ne touche ni au cookie
 * Visiteur ni à la base — la couture de stockage (`StockagePanier`) et le
 * Catalogue (`CataloguePanier`) y sont injectés, jamais résolus. Les
 * adaptateurs de production (jar cookie, Prisma) et la composition
 * (résolution du Propriétaire, adaptateur Catalogue sur `prisma`)
 * vivent dans `@/lib/panier`, l'unique point d'entrée du module.
 *
 * Le chemin de commandes (`ajouter` / `modifier` / `retirer`) existe une
 * seule fois, dans `creerPanierStore` : validité de la quantité, motif de
 * l'identifiant vide déclaré par le stockage, plafond d'Articles
 * distincts (fusion au plafond), revalidation de la Variante via le
 * Catalogue, présence de l'Article, sélection du Refus du panier et ses
 * messages exacts — la précédence de chaque commande est figée ici.
 * Les faits du Propriétaire sont déclarés par le stockage : le plafond
 * optionnel (`capArticlesMax`, Visiteur seul — ADR-0007) et le motif de
 * l'identifiant vide optionnel (`motifIdentifiantVide` — le cookie replie
 * l'identifiant vide sur « quantité invalide ») ; un stockage sans motif
 * déclaré laisse l'identifiant vide tomber jusqu'au manqué du Catalogue
 * (« variante inconnue »).
 *
 * `lire` et `compter` restent des requêtes propres à chaque adaptateur :
 * la fabrique ne les orchestre pas, elle délègue au stockage. La
 * projection (`construireArticleDuPanier`, `calculerTotauxPanier`) est
 * pure et partagée par les deux adaptateurs via ce cœur.
 *
 * Les types publics (`MotifRefusPanier`, `ResultatPanier`,
 * `ArticleDuPanier`, `DonneesPanier`) vivent ici et sont réexportés par
 * `@/lib/panier` — noms et formes inchangés pour les consommateurs.
 * `ResultatPanier` porte le message relayé verbatim par la couture
 * cliente (ADR-0018) ; le serveur possède la formulation des refus et
 * les faits qu'ils citent (le plafond Visiteur).
 */
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

/**
 * Article stocké brut : la paire identifiant de Variante + quantité, telle
 * que le stockage la retient (entrée du cookie Visiteur, ligne persistée
 * du Client). Strictement des données.
 */
export interface ArticleStockePanier {
  variantId: string
  quantity: number
}

/**
 * Couture interne de stockage du Panier : les mécaniques neutres dont les
 * deux Paniers ont besoin, sans jamais prendre de paramètre Propriétaire —
 * le Propriétaire est fixé à la construction de l'adaptateur.
 *
 * Sept opérations : lire le Panier projeté (`lire`), compter
 * (`compter`), lire les Articles stockés bruts (`lireArticlesStockes`),
 * tester la présence d'un Article (`possedeArticle`), ajouter de la
 * quantité de façon additive (`ajouterQuantite`), fixer la quantité
 * (`definirQuantite`), retirer en rapportant si quelque chose a été
 * retiré (`retirerArticle`).
 *
 * Deux faits du Propriétaire, déclarés par l'adaptateur : `capArticlesMax`
 * (plafond optionnel d'Articles distincts — Visiteur seul) et
 * `motifIdentifiantVide` (motif de refus optionnel pour un identifiant
 * vide à l'ajout).
 */
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

/**
 * Couture du Catalogue : une seule question — la Variante existe-t-elle ?
 * L'adaptateur de production interroge `prisma.productVariant` ; les tests
 * injectent un faux. L'existence d'une Variante est une question de
 * Catalogue, pas de stockage.
 */
export interface CataloguePanier {
  existe(variantId: string): Promise<boolean>
}

/** La couture du module : les cinq opérations publiques du Panier. */
export interface PanierStore {
  lire(): Promise<DonneesPanier>
  compter(): Promise<number>
  ajouter(variantId: string, quantity: number): Promise<ResultatPanier>
  modifier(variantId: string, quantity: number): Promise<ResultatPanier>
  retirer(variantId: string): Promise<ResultatPanier>
}

// ----------------------------------------------------------------------------
// Refus du panier : motifs et messages exacts, produits en un seul endroit
// ----------------------------------------------------------------------------

const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

/**
 * Le message d'un Refus du panier, citant le fait déclaré : le message du
 * plafond est interpolé depuis la capacité déclarée par le stockage.
 */
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

function quantiteValide(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1
}

/**
 * Fabrique du PanierStore — le chemin de commandes partagé, implémenté
 * une seule fois sur la couture de stockage et le Catalogue. `lire` et
 * `compter` délègent au stockage (requêtes propres à chaque adaptateur).
 *
 * Précédence d'`ajouter` : quantité invalide, puis identifiant vide
 * (replié sur le motif déclaré par le stockage — sans motif déclaré, il
 * tombe jusqu'au manqué du Catalogue), puis plafond — refusé seulement si
 * l'Article n'est pas déjà présent (fusionner un Article existant au
 * plafond réussit) — puis revalidation de la Variante, puis écriture.
 * Précédence de `modifier` : quantité invalide, puis Article inconnu,
 * puis revalidation de la Variante. Précédence de `retirer` : Article
 * inconnu — aucune quantité, aucune Variante. Ne lève jamais : chaque
 * commande répond par un `ResultatPanier` auto-descriptif.
 */
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

// ----------------------------------------------------------------------------
// Projection et calculs partagés (purs)
// ----------------------------------------------------------------------------

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

/**
 * Projette une Variante (avec son Produit) et une quantité en Article du
 * Panier : le Prix courant compose la règle canonique pure
 * (`prixVariante`) ; la première image du Produit, sinon null.
 */
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

/** Totaux du Panier : sous-total (somme des lignes) et nombre d'unités. */
export function calculerTotauxPanier(
  articles: readonly ArticleDuPanier[]
): Pick<DonneesPanier, "subtotal" | "itemCount"> {
  return {
    subtotal: articles.reduce((somme, article) => somme + article.lineTotal, 0),
    itemCount: articles.reduce((somme, article) => somme + article.quantity, 0),
  }
}
