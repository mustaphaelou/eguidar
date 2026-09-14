import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  calculerTotauxPanier,
  construireArticleDuPanier,
  creerPanierStore,
  type ArticleDuPanier,
  type ArticleStockePanier,
  type CataloguePanier,
  type DonneesPanier,
  type PanierStore,
  type ResultatPanier,
  type StockagePanier,
} from "@/lib/panier-coeur"

// ============================================================================
// Types et interface publique
// ============================================================================

export type {
  MotifRefusPanier,
  ResultatPanier,
  ArticleDuPanier,
  DonneesPanier,
} from "@/lib/panier-coeur"

type ProprietaireDuPanier =
  | { role: "visiteur" }
  | { role: "client"; compteId: string }

async function resoudreProprietaire(): Promise<ProprietaireDuPanier> {
  // Import dynamique : un import statique tirerait `server-only` (via
  // get-session) dans chaque consommateur sans session mockée. Le mock
  // `vi.mock("@/lib/use-cases/get-session")` intercepte cet import dynamique.
  const { getSessionUser } = await import("@/lib/use-cases/get-session")
  const user = await getSessionUser()
  return user ? { role: "client", compteId: user.id } : { role: "visiteur" }
}

async function resoudreStore(): Promise<PanierStore> {
  const proprietaire = await resoudreProprietaire()
  return proprietaire.role === "client"
    ? creerStoreClient(proprietaire.compteId)
    : creerPanierStore(creerStockagePanierVisiteur(), catalogueProduction())
}

// ----------------------------------------------------------------------------
// Entrées publiques
// ----------------------------------------------------------------------------

/**
 * Lit le Panier du Visiteur ou du Client courant : la résolution du
 * Propriétaire (session → Client, sinon cookie Visiteur) vit derrière
 * l'interface, l'appelant ne choisit jamais de branche.
 */
export async function lirePanier(): Promise<DonneesPanier> {
  return (await resoudreStore()).lire()
}

/** Compte le Panier courant (somme des quantités). */
export async function compterArticlesDuPanier(): Promise<number> {
  return (await resoudreStore()).compter()
}

/** Ajoute une Variante (identifiant de Variante + quantité) au Panier courant. */
export async function ajouterArticleAuPanier(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return (await resoudreStore()).ajouter(variantId, quantity)
}

/**
 * Modifie la quantité d'un Article du Panier courant, identifié par le
 * `variantId` de sa Variante — pour le Client comme pour le Visiteur.
 * Le Client est résolu sur sa ligne persistée via l'unicité par-compte
 * de la Variante.
 */
export async function modifierQuantiteArticlePanier(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return (await resoudreStore()).modifier(variantId, quantity)
}

/**
 * Retire un Article du Panier courant, identifié par le `variantId` de sa
 * Variante — pour le Client comme pour le Visiteur.
 */
export async function retirerArticleDuPanier(
  variantId: string
): Promise<ResultatPanier> {
  return (await resoudreStore()).retirer(variantId)
}

/**
 * Lit directement le Panier persisté d'un Compte client en base, sans
 * toucher aux cookies : couture dédiée à l'intake de la Commande
 * (`placeOrder`), découplée de toute requête navigateur.
 */
export async function lirePanierClient(
  compteId: string
): Promise<DonneesPanier> {
  return creerStoreClient(compteId).lire()
}

/**
 * Rejoue le Panier Visiteur (cookie) d'un Compte client dans son Panier
 * persisté, puis supprime le cookie : couture dédiée au callback
 * d'authentification, qui prend l'identifiant du compte directement.
 * Le rejeu est best-effort : un article mort ne le bloque jamais.
 */
export async function rejouerPanierVisiteur(compteId: string): Promise<void> {
  const stockageVisiteur = creerStockagePanierVisiteur()
  if (!(await stockageVisiteur.possedePanier())) return

  const storeClient = creerStoreClient(compteId)
  for (const article of await stockageVisiteur.lireArticlesStockes()) {
    try {
      await storeClient.ajouter(article.variantId, article.quantity)
    } catch {
      // Article mort : le rejeu est best-effort, il ne doit jamais bloquer.
    }
  }

  await stockageVisiteur.supprimerPanier()
}

// ============================================================================
// Stockage Visiteur (cookie) — l'adaptateur de la couture `StockagePanier`
// ============================================================================

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const MAX_ARTICLES_PANIER_VISITEUR = 20
const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

function quantiteValide(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1
}

function estArticleValide(article: unknown): article is ArticleStockePanier {
  if (typeof article !== "object" || article === null) return false
  const { variantId, quantity } = article as Record<string, unknown>
  return (
    typeof variantId === "string" &&
    variantId.length > 0 &&
    typeof quantity === "number" &&
    quantiteValide(quantity)
  )
}

function normaliser(
  articles: readonly ArticleStockePanier[]
): ArticleStockePanier[] {
  const quantitesParVariant = new Map<string, number>()
  for (const article of articles) {
    if (!estArticleValide(article)) continue
    quantitesParVariant.set(
      article.variantId,
      (quantitesParVariant.get(article.variantId) ?? 0) + article.quantity
    )
  }
  const fusionnes = [...quantitesParVariant].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }))
  return fusionnes.slice(0, MAX_ARTICLES_PANIER_VISITEUR)
}

function serializePanierVisiteur(
  articles: readonly ArticleStockePanier[]
): string {
  return JSON.stringify(normaliser(articles))
}

function parsePanierVisiteur(raw?: string | null): ArticleStockePanier[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return normaliser(parsed.filter(estArticleValide))
}

async function lireArticlesStockesVisiteur(): Promise<ArticleStockePanier[]> {
  const jar = await cookies()
  return parsePanierVisiteur(jar.get(NOM_COOKIE_PANIER_VISITEUR)?.value)
}

async function ecrirePanierVisiteur(
  articles: readonly ArticleStockePanier[]
): Promise<void> {
  const jar = await cookies()
  jar.set(NOM_COOKIE_PANIER_VISITEUR, serializePanierVisiteur(articles), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PANIER_VISITEUR_MAX_AGE,
  })
}

/**
 * Fabrique du stockage Visiteur : la mécanique cookie seule, derrière la
 * couture `StockagePanier` — analyse de la liste entière, fusion,
 * normalisation, sérialisation, comptage des survivants, écritures.
 * Les faits du Propriétaire y sont déclarés : le plafond de 20 Articles
 * distincts et le motif de l'identifiant vide replié sur
 * « quantité invalide » (ADR-0007). La validité, les refus et leurs
 * messages vivent dans le cœur (`creerPanierStore`), jamais ici.
 *
 * Les Variantes mortes traversent la lecture brute (`lireArticlesStockes`)
 * : leur éviction est l'affaire de la projection (`lire`) et du comptage
 * (`compter`), pas de l'analyse. La présence du cookie (`possedePanier`)
 * et sa suppression (`supprimerPanier`) appartiennent aussi au stockage —
 * le rejeu à l'authentification les emprunte telles quelles.
 */
function creerStockagePanierVisiteur(): StockagePanier & {
  possedePanier(): Promise<boolean>
  supprimerPanier(): Promise<void>
} {
  return {
    capArticlesMax: MAX_ARTICLES_PANIER_VISITEUR,
    motifIdentifiantVide: "quantite-invalide",

    async lire(): Promise<DonneesPanier> {
      const articles = await lireArticlesStockesVisiteur()
      if (articles.length === 0) {
        return { lines: [], subtotal: 0, itemCount: 0 }
      }

      const variants = await prisma.productVariant.findMany({
        where: { id: { in: articles.map((article) => article.variantId) } },
        include: { product: true },
      })
      const parId = new Map(variants.map((variant) => [variant.id, variant]))

      const articlesDuPanier: ArticleDuPanier[] = []
      for (const article of articles) {
        const variant = parId.get(article.variantId)
        if (!variant) continue
        articlesDuPanier.push(
          construireArticleDuPanier(variant, article.quantity)
        )
      }

      return { lines: articlesDuPanier, ...calculerTotauxPanier(articlesDuPanier) }
    },

    async compter(): Promise<number> {
      const articles = await lireArticlesStockesVisiteur()
      if (articles.length === 0) return 0

      const variantsSurvivants = await prisma.productVariant.findMany({
        where: { id: { in: articles.map((article) => article.variantId) } },
        select: { id: true },
      })
      const survivants = new Set(variantsSurvivants.map((v) => v.id))

      return articles.reduce(
        (somme, article) =>
          survivants.has(article.variantId) ? somme + article.quantity : somme,
        0
      )
    },

    async lireArticlesStockes(): Promise<ArticleStockePanier[]> {
      return lireArticlesStockesVisiteur()
    },

    async possedeArticle(variantId: string): Promise<boolean> {
      const articles = await lireArticlesStockesVisiteur()
      return articles.some((article) => article.variantId === variantId)
    },

    async ajouterQuantite(variantId: string, quantity: number): Promise<void> {
      const articles = await lireArticlesStockesVisiteur()
      await ecrirePanierVisiteur(
        articles.some((article) => article.variantId === variantId)
          ? articles.map((article) =>
              article.variantId === variantId
                ? { ...article, quantity: article.quantity + quantity }
                : article
            )
          : [...articles, { variantId, quantity }]
      )
    },

    async definirQuantite(variantId: string, quantity: number): Promise<void> {
      const articles = await lireArticlesStockesVisiteur()
      await ecrirePanierVisiteur(
        articles.map((article) =>
          article.variantId === variantId ? { ...article, quantity } : article
        )
      )
    },

    async retirerArticle(variantId: string): Promise<boolean> {
      const articles = await lireArticlesStockesVisiteur()
      const restants = articles.filter(
        (article) => article.variantId !== variantId
      )
      if (restants.length === articles.length) return false

      await ecrirePanierVisiteur(restants)
      return true
    },

    async possedePanier(): Promise<boolean> {
      const jar = await cookies()
      return jar.get(NOM_COOKIE_PANIER_VISITEUR) !== undefined
    },

    async supprimerPanier(): Promise<void> {
      const jar = await cookies()
      jar.delete(NOM_COOKIE_PANIER_VISITEUR)
    },
  }
}

/** Adaptateur Catalogue de production : l'existence d'une Variante via Prisma. */
function catalogueProduction(): CataloguePanier {
  return {
    async existe(variantId: string): Promise<boolean> {
      return (
        (await prisma.productVariant.findUnique({ where: { id: variantId } })) !==
        null
      )
    },
  }
}

// ============================================================================
// Store Client (persistant)
// ============================================================================

const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

function creerStoreClient(compteId: string): PanierStore {
  return {
    async lire(): Promise<DonneesPanier> {
      const items = await prisma.cartItem.findMany({
        where: { userId: compteId },
        orderBy: { createdAt: "asc" },
        include: { variant: { include: { product: true } } },
      })

      const articlesDuPanier = items.map((item) =>
        construireArticleDuPanier(item.variant, item.quantity)
      )

      return { lines: articlesDuPanier, ...calculerTotauxPanier(articlesDuPanier) }
    },

    async compter(): Promise<number> {
      const aggregate = await prisma.cartItem.aggregate({
        where: { userId: compteId },
        _sum: { quantity: true },
      })
      return aggregate._sum.quantity ?? 0
    },

    async ajouter(variantId: string, quantity: number): Promise<ResultatPanier> {
      if (!quantiteValide(quantity)) {
        return {
          ok: false,
          motif: "quantite-invalide",
          message: MESSAGE_QUANTITE_INVALIDE,
        }
      }
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
      })
      if (!variant) {
        return {
          ok: false,
          motif: "variante-inconnue",
          message: MESSAGE_VARIANTE_INCONNUE,
        }
      }

      await prisma.cartItem.upsert({
        where: { userId_variantId: { userId: compteId, variantId } },
        update: { quantity: { increment: quantity } },
        create: { userId: compteId, variantId, quantity },
      })
      return { ok: true }
    },

    async modifier(variantId: string, quantity: number): Promise<ResultatPanier> {
      if (!quantiteValide(quantity)) {
        return {
          ok: false,
          motif: "quantite-invalide",
          message: MESSAGE_QUANTITE_INVALIDE,
        }
      }
      const existing = await prisma.cartItem.findUnique({
        where: { userId_variantId: { userId: compteId, variantId } },
      })
      if (!existing) {
        return {
          ok: false,
          motif: "article-inconnu",
          message: MESSAGE_ARTICLE_INCONNU,
        }
      }

      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      })
      return { ok: true }
    },

    async retirer(variantId: string): Promise<ResultatPanier> {
      const existing = await prisma.cartItem.findUnique({
        where: { userId_variantId: { userId: compteId, variantId } },
      })
      if (!existing) {
        return {
          ok: false,
          motif: "article-inconnu",
          message: MESSAGE_ARTICLE_INCONNU,
        }
      }

      await prisma.cartItem.delete({ where: { id: existing.id } })
      return { ok: true }
    },
  }
}
