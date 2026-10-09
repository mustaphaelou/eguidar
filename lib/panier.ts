import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  calculerTotauxPanier,
  construireArticleDuPanier,
  creerPanierStore,
  quantiteValide,
  type ArticleDuPanier,
  type ArticleStockePanier,
  type CataloguePanier,
  type DonneesPanier,
  type PanierStore,
  type ResultatPanier,
  type StockagePanier,
} from "@/lib/panier-coeur"

export type {
  MotifRefusPanier,
  ResultatPanier,
  ArticleDuPanier,
  DonneesPanier,
} from "@/lib/panier-coeur"

type ProprietaireDuPanier =
  { role: "visiteur" } | { role: "client"; compteId: string }

async function resoudreProprietaire(): Promise<ProprietaireDuPanier> {
  const { lireSession } = await import("@/lib/use-cases/session-courante")
  const client = await lireSession()
  return client ? { role: "client", compteId: client.id } : { role: "visiteur" }
}

function composerStoreVisiteur(): PanierStore {
  return creerPanierStore(creerStockagePanierVisiteur(), catalogueProduction())
}

function composerStoreClientExplicite(compteId: string): PanierStore {
  return creerPanierStore(
    creerStockagePanierClient(compteId),
    catalogueProduction()
  )
}

async function resoudreStore(): Promise<PanierStore> {
  const proprietaire = await resoudreProprietaire()
  return proprietaire.role === "client"
    ? composerStoreClientExplicite(proprietaire.compteId)
    : composerStoreVisiteur()
}

export async function lirePanier(): Promise<DonneesPanier> {
  return (await resoudreStore()).lire()
}

export async function compterArticlesDuPanier(): Promise<number> {
  return (await resoudreStore()).compter()
}

export async function ajouterArticleAuPanier(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return (await resoudreStore()).ajouter(variantId, quantity)
}

export async function modifierQuantiteArticlePanier(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return (await resoudreStore()).modifier(variantId, quantity)
}

export async function retirerArticleDuPanier(
  variantId: string
): Promise<ResultatPanier> {
  return (await resoudreStore()).retirer(variantId)
}

export async function lirePanierClient(
  compteId: string
): Promise<DonneesPanier> {
  return composerStoreClientExplicite(compteId).lire()
}

export async function rejouerPanierVisiteur(compteId: string): Promise<void> {
  const stockageVisiteur = creerStockagePanierVisiteur()
  if (!(await stockageVisiteur.possedePanier())) return

  const storeClient = composerStoreClientExplicite(compteId)
  for (const article of await stockageVisiteur.lireArticlesStockes()) {
    try {
      await storeClient.ajouter(article.variantId, article.quantity)
    } catch {}
  }

  await stockageVisiteur.supprimerPanier()
}

type StockagePanierRejouable = StockagePanier & {
  possedePanier(): Promise<boolean>
  supprimerPanier(): Promise<void>
}

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const MAX_ARTICLES_PANIER_VISITEUR = 20
const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

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

function contient(
  articles: readonly ArticleStockePanier[],
  variantId: string
): boolean {
  return articles.some((article) => article.variantId === variantId)
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
  return normaliser(parsed)
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

function creerStockagePanierVisiteur(): StockagePanierRejouable {
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

      return {
        lines: articlesDuPanier,
        ...calculerTotauxPanier(articlesDuPanier),
      }
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
      return contient(articles, variantId)
    },

    async ajouterQuantite(variantId: string, quantity: number): Promise<void> {
      const articles = await lireArticlesStockesVisiteur()
      await ecrirePanierVisiteur(
        contient(articles, variantId)
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

function catalogueProduction(): CataloguePanier {
  return {
    async existe(variantId: string): Promise<boolean> {
      return (
        (await prisma.productVariant.findUnique({
          where: { id: variantId },
        })) !== null
      )
    },
  }
}

function creerStockagePanierClient(compteId: string): StockagePanier {
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

      return {
        lines: articlesDuPanier,
        ...calculerTotauxPanier(articlesDuPanier),
      }
    },

    async compter(): Promise<number> {
      const aggregate = await prisma.cartItem.aggregate({
        where: { userId: compteId },
        _sum: { quantity: true },
      })
      return aggregate._sum.quantity ?? 0
    },

    async lireArticlesStockes(): Promise<ArticleStockePanier[]> {
      return prisma.cartItem.findMany({
        where: { userId: compteId },
        select: { variantId: true, quantity: true },
        orderBy: { createdAt: "asc" },
      })
    },

    async possedeArticle(variantId: string): Promise<boolean> {
      const item = await prisma.cartItem.findUnique({
        where: { userId_variantId: { userId: compteId, variantId } },
      })
      return item !== null
    },

    async ajouterQuantite(variantId: string, quantity: number): Promise<void> {
      await prisma.cartItem.upsert({
        where: { userId_variantId: { userId: compteId, variantId } },
        update: { quantity: { increment: quantity } },
        create: { userId: compteId, variantId, quantity },
      })
    },

    async definirQuantite(variantId: string, quantity: number): Promise<void> {
      await prisma.cartItem.update({
        where: { userId_variantId: { userId: compteId, variantId } },
        data: { quantity },
      })
    },

    async retirerArticle(variantId: string): Promise<boolean> {
      const supprimes = await prisma.cartItem.deleteMany({
        where: { userId: compteId, variantId },
      })
      return supprimes.count > 0
    },
  }
}
