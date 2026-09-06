import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import { prixVariante } from "@/lib/product-metrics"

// ============================================================================
// Types et interface publique
// ============================================================================

export type MotifRefusPanier =
  | "cap-atteinte"
  | "quantite-invalide"
  | "variante-inconnue"
  | "article-inconnu"

export type ResultatPanier =
  | { ok: true }
  | { ok: false; motif: MotifRefusPanier; message: string }

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

type ProprietaireDuPanier =
  | { role: "visiteur" }
  | { role: "client"; compteId: string }

interface PanierStore {
  lire(): Promise<DonneesPanier>
  compter(): Promise<number>
  ajouter(variantId: string, quantity: number): Promise<ResultatPanier>
  modifier(variantId: string, quantity: number): Promise<ResultatPanier>
  retirer(variantId: string): Promise<ResultatPanier>
}

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
    : storeVisiteur
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
  if (!(await possedeCookiePanierVisiteur())) return

  const storeClient = creerStoreClient(compteId)
  for (const article of await lireArticlesPanierVisiteur()) {
    try {
      await storeClient.ajouter(article.variantId, article.quantity)
    } catch {
      // Article mort : le rejeu est best-effort, il ne doit jamais bloquer.
    }
  }

  await supprimerCookiePanierVisiteur()
}

// ============================================================================
// Store Visiteur (cookie)
// ============================================================================

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const MAX_ARTICLES_PANIER_VISITEUR = 20
const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

const MESSAGE_CAP_ATTEINTE = `Votre panier est plein : ${MAX_ARTICLES_PANIER_VISITEUR} articles maximum.`
const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

interface ArticlePanierVisiteur {
  variantId: string
  quantity: number
}

function quantiteValide(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1
}

function estArticleValide(article: unknown): article is ArticlePanierVisiteur {
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
  articles: readonly ArticlePanierVisiteur[]
): ArticlePanierVisiteur[] {
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
  articles: readonly ArticlePanierVisiteur[]
): string {
  return JSON.stringify(normaliser(articles))
}

function parsePanierVisiteur(raw?: string | null): ArticlePanierVisiteur[] {
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

function ajouterAuPanierVisiteur(
  articles: readonly ArticlePanierVisiteur[],
  variantId: string,
  quantity: number
): { ok: true; articles: ArticlePanierVisiteur[] } | {
  ok: false
  motif: "cap-atteinte" | "quantite-invalide"
} {
  const actuels = normaliser(articles)
  if (variantId.length === 0 || !quantiteValide(quantity)) {
    return { ok: false, motif: "quantite-invalide" }
  }
  const existant = actuels.find((article) => article.variantId === variantId)
  if (existant) {
    return {
      ok: true,
      articles: actuels.map((article) =>
        article.variantId === variantId
          ? { ...article, quantity: article.quantity + quantity }
          : article
      ),
    }
  }
  if (actuels.length >= MAX_ARTICLES_PANIER_VISITEUR) {
    return { ok: false, motif: "cap-atteinte" }
  }
  return { ok: true, articles: [...actuels, { variantId, quantity }] }
}

async function lireArticlesPanierVisiteur(): Promise<ArticlePanierVisiteur[]> {
  const jar = await cookies()
  return parsePanierVisiteur(jar.get(NOM_COOKIE_PANIER_VISITEUR)?.value)
}

async function ecrirePanierVisiteur(
  articles: readonly ArticlePanierVisiteur[]
): Promise<void> {
  const jar = await cookies()
  jar.set(NOM_COOKIE_PANIER_VISITEUR, serializePanierVisiteur(articles), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PANIER_VISITEUR_MAX_AGE,
  })
}

async function possedeCookiePanierVisiteur(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(NOM_COOKIE_PANIER_VISITEUR) !== undefined
}

async function supprimerCookiePanierVisiteur(): Promise<void> {
  const jar = await cookies()
  jar.delete(NOM_COOKIE_PANIER_VISITEUR)
}

const storeVisiteur: PanierStore = {
  async lire(): Promise<DonneesPanier> {
    const articles = await lireArticlesPanierVisiteur()
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
      articlesDuPanier.push(construireArticleDuPanier(variant, article.quantity))
    }

    return { lines: articlesDuPanier, ...calculerTotauxPanier(articlesDuPanier) }
  },

  async compter(): Promise<number> {
    const articles = await lireArticlesPanierVisiteur()
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

  async ajouter(variantId: string, quantity: number): Promise<ResultatPanier> {
    const articles = await lireArticlesPanierVisiteur()
    const resultat = ajouterAuPanierVisiteur(articles, variantId, quantity)
    if (!resultat.ok) {
      return {
        ok: false,
        motif: resultat.motif,
        message:
          resultat.motif === "cap-atteinte"
            ? MESSAGE_CAP_ATTEINTE
            : MESSAGE_QUANTITE_INVALIDE,
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

    await ecrirePanierVisiteur(resultat.articles)
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

    const articles = await lireArticlesPanierVisiteur()
    if (!articles.some((article) => article.variantId === variantId)) {
      return {
        ok: false,
        motif: "article-inconnu",
        message: MESSAGE_ARTICLE_INCONNU,
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

    await ecrirePanierVisiteur(
      articles.map((article) =>
        article.variantId === variantId ? { ...article, quantity } : article
      )
    )
    return { ok: true }
  },

  async retirer(variantId: string): Promise<ResultatPanier> {
    const articles = await lireArticlesPanierVisiteur()
    const restants = articles.filter(
      (article) => article.variantId !== variantId
    )
    if (restants.length === articles.length) {
      return {
        ok: false,
        motif: "article-inconnu",
        message: MESSAGE_ARTICLE_INCONNU,
      }
    }

    await ecrirePanierVisiteur(restants)
    return { ok: true }
  },
}

// ============================================================================
// Store Client (persistant)
// ============================================================================

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

// ============================================================================
// Projection et calculs partagés
// ============================================================================

interface VarianteAvecProduit {
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

function construireArticleDuPanier(
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

function calculerTotauxPanier(
  articles: readonly ArticleDuPanier[]
): Pick<DonneesPanier, "subtotal" | "itemCount"> {
  return {
    subtotal: articles.reduce((somme, article) => somme + article.lineTotal, 0),
    itemCount: articles.reduce((somme, article) => somme + article.quantity, 0),
  }
}
