/**
 * Entrée serveur du Panier : les sept entrées publiques, les deux
 * adaptateurs de stockage et la composition — un seul store sur deux
 * stockages. Réexport du cœur pur pour les consommateurs (`MotifRefusPanier`,
 * `ResultatPanier`, `ArticleDuPanier`, `DonneesPanier`, noms et formes
 * inchangés) ; les types internes de la couture et la fabrique du store
 * (`StockagePanier`, `CataloguePanier`, `creerPanierStore`) vivent dans
 * `@/lib/panier-coeur` et ne traversent jamais cette entrée.
 *
 * Le chemin de commandes — validité, plafond, revalidation de la
 * Variante, présence de l'Article, sélection des Refus et leurs messages
 * — existe une seule fois, dans la fabrique du cœur ; cette entrée ne
 * possède que la mécanique : le jar cookie (analyse, sérialisation,
 * écritures) pour le Visiteur, les écritures par ligne atomiques et les
 * lectures jointes pour le Client persisté. Chaque adaptateur déclare
 * ses faits de Propriétaire au cœur (le plafond de 20 Articles distincts
 * et le motif de l'identifiant vide pour le Visiteur — ADR-0007 ; rien
 * pour le Client). Un Refus du panier est relayé verbatim par la couture
 * cliente (ADR-0018) : sa formulation vit dans le cœur, jamais ici.
 *
 * La composition résout le Propriétaire (session → Client, sinon cookie
 * Visiteur) et construit le store via la même fabrique pour les deux
 * branches — les entrées à Propriétaire explicite (`lirePanierClient`,
 * `rejouerPanierVisiteur`) composent la même fabrique ; aucune entrée
 * n'assemble son propre store ni ne contourne la résolution.
 *
 * Import dynamique de `get-session` : un import statique tirerait
 * `server-only` dans chaque consommateur sans session mockée ; le mock
 * `vi.mock("@/lib/use-cases/get-session")` intercepte cet import
 * dynamique.
 */
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
  { role: "visiteur" } | { role: "client"; compteId: string }

async function resoudreProprietaire(): Promise<ProprietaireDuPanier> {
  // Import dynamique : un import statique tirerait `server-only` (via
  // get-session) dans chaque consommateur sans session mockée. Le mock
  // `vi.mock("@/lib/use-cases/get-session")` intercepte cet import dynamique.
  const { getSessionUser } = await import("@/lib/use-cases/get-session")
  const user = await getSessionUser()
  return user ? { role: "client", compteId: user.id } : { role: "visiteur" }
}

/**
 * Composition du store derrière la couture : chaque branche (Visiteur,
 * Client explicite) passe par la même fabrique de stockage et le même
 * `creerPanierStore` — jamais d'adaptateur construit à la main, ici comme
 * dans le rejeu (`rejouerPanierVisiteur`).
 */
function composerStoreVisiteur(): PanierStore {
  return creerPanierStore(creerStockagePanierVisiteur(), catalogueProduction())
}

/**
 * Couture du Propriétaire explicite : la composition du store Client pour
 * un Compte connu — le Compte est fixé à la composition, la couture ne
 * prend jamais de paramètre Propriétaire. La même fabrique
 * (`creerPanierStore`), le même stockage persisté et le même Catalogue
 * que la résolution du Propriétaire ; les entrées à Propriétaire
 * explicite la traversent — aucune n'assemble son propre store ni ne
 * contourne la composition.
 */
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
  return composerStoreClientExplicite(compteId).lire()
}

/**
 * Rejoue le Panier Visiteur (cookie) d'un Compte client dans son Panier
 * persisté, puis supprime le cookie : couture dédiée au callback
 * d'authentification, qui prend l'identifiant du compte directement.
 * Le rejeu est best-effort : un article mort ne le bloque jamais.
 */
export async function rejouerPanierVisiteur(compteId: string): Promise<void> {
  // Rejeu : le stockage Visiteur et le store Client sortent de la même
  // composition que les entrées requête (`resoudreStore`,
  // `composerStoreClientExplicite`) — aucun adaptateur construit à la
  // main dans le chemin du callback.
  const stockageVisiteur = creerStockagePanierVisiteur()
  if (!(await stockageVisiteur.possedePanier())) return

  const storeClient = composerStoreClientExplicite(compteId)
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

/**
 * L'extension de support du rejeu, exposée sous la même forme par les deux
 * stockages (Visiteur et Client) : la présence du support (`possedePanier`)
 * et sa suppression (`supprimerPanier`) — le rejeu à l'authentification les
 * emprunte telles quelles.
 */
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
        (await prisma.productVariant.findUnique({
          where: { id: variantId },
        })) !== null
      )
    },
  }
}

// ============================================================================
// Stockage Client (persisté) — l'adaptateur de la couture `StockagePanier`
// ============================================================================

/**
 * Fabrique du stockage Client : la mécanique Prisma seule, derrière la
 * couture `StockagePanier` — le Compte est fixé à la construction, la
 * couture ne prend jamais de paramètre Propriétaire. Écritures par ligne,
 * atomiques : l'ajout incrémente la quantité dans un upsert (`increment` —
 * deux onglets qui ajoutent en même temps ne perdent jamais de quantité),
 * la modification fixe la quantité sur la ligne par-compte de la Variante,
 * le retrait supprime en une seule opération et rapporte si une ligne a
 * disparu.
 *
 * La lecture jointe (`variant.product`) et le comptage agrégé restent des
 * requêtes propres à l'adaptateur ; la projection vit dans le cœur. Aucune
 * éviction de Variante morte n'y est nécessaire : la cascade de la clé
 * étrangère garantit qu'un Article du Panier ne survit pas à sa Variante.
 *
 * Aucun plafond, aucun motif d'identifiant vide déclaré (ADR-0007 garde le
 * plafond Visiteur seul) : un identifiant vide à l'ajout tombe jusqu'au
 * manqué du Catalogue — « variante inconnue », exactement comme livré. La
 * validité, les refus et leurs messages vivent dans le cœur
 * (`creerPanierStore`), jamais ici.
 *
 * Les opérations de support du rejeu (`possedePanier`, `supprimerPanier`)
 * sont des no-op bénins pour le Client : le Panier persisté n'est pas un
 * support dont le rejeu partirait, et il n'est jamais supprimé comme
 * support.
 */
function creerStockagePanierClient(compteId: string): StockagePanierRejouable {
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

    async possedePanier(): Promise<boolean> {
      return false
    },

    async supprimerPanier(): Promise<void> {
      // Le Panier persisté n'est jamais supprimé comme support.
    },
  }
}
