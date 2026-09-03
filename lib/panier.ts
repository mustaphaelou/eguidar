import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  addToPanierVisiteur,
  parsePanierVisiteur,
  quantiteValide,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
  type MotifRefusPanierVisiteur,
} from "@/lib/panier-visiteur"

const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

export const MOTIF_QUANTITE_INVALIDE = "quantite-invalide" as const
export const MOTIF_VARIANTE_INCONNUE = "variante-inconnue" as const
export const MOTIF_ARTICLE_INCONNU = "article-inconnu" as const

export type ProprietairePanier =
  { role: "visiteur" } | { role: "client"; compteId: string }

export type MotifRefusPanier =
  | MotifRefusPanierVisiteur
  | typeof MOTIF_VARIANTE_INCONNUE
  | typeof MOTIF_ARTICLE_INCONNU

export type ResultatPanier =
  { ok: true } | { ok: false; motif: MotifRefusPanier }

export interface ArticleDuPanier {
  articlePanierId: string
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

/** Résout le Propriétaire du panier à partir de la session courante (ou null). */
export function resoudreProprietairePanier(
  user: { id: string } | null
): ProprietairePanier {
  return user ? { role: "client", compteId: user.id } : { role: "visiteur" }
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

async function ajouterArticleAuPanierClient(
  compteId: string,
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (!quantiteValide(quantity)) {
    return { ok: false, motif: MOTIF_QUANTITE_INVALIDE }
  }
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
  })
  if (!variant) return { ok: false, motif: MOTIF_VARIANTE_INCONNUE }

  await prisma.cartItem.upsert({
    where: { userId_variantId: { userId: compteId, variantId } },
    update: { quantity: { increment: quantity } },
    create: { userId: compteId, variantId, quantity },
  })
  return { ok: true }
}

/**
 * Modifie la quantité d'un article du panier.
 *
 * `articlePanierId` identifie l'article visé, selon le Propriétaire : pour un
 * Client, l'identifiant persisté de l'article du panier dans sa base ; pour un
 * Visiteur, le `variantId` porté par l'article de son cookie. Le module
 * interprète ce paramètre selon le Propriétaire courant.
 */
export async function modifierQuantiteArticlePanier(
  proprietaire: ProprietairePanier,
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (proprietaire.role === "client") {
    return modifierQuantiteArticlePanierClient(
      proprietaire.compteId,
      articlePanierId,
      quantity
    )
  }

  if (!quantiteValide(quantity)) {
    return { ok: false, motif: MOTIF_QUANTITE_INVALIDE }
  }

  const articles = await lireArticlesPanierVisiteur()
  if (!articles.some((article) => article.variantId === articlePanierId)) {
    return { ok: false, motif: MOTIF_ARTICLE_INCONNU }
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: articlePanierId },
  })
  if (!variant) return { ok: false, motif: MOTIF_VARIANTE_INCONNUE }

  await ecrirePanierVisiteur(
    articles.map((article) =>
      article.variantId === articlePanierId ? { ...article, quantity } : article
    )
  )
  return { ok: true }
}

async function modifierQuantiteArticlePanierClient(
  compteId: string,
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (!quantiteValide(quantity)) {
    return { ok: false, motif: MOTIF_QUANTITE_INVALIDE }
  }
  const existing = await prisma.cartItem.findFirst({
    where: { id: articlePanierId, userId: compteId },
  })
  if (!existing) return { ok: false, motif: MOTIF_ARTICLE_INCONNU }

  await prisma.cartItem.update({
    where: { id: articlePanierId },
    data: { quantity },
  })
  return { ok: true }
}

/**
 * Retire un article du panier.
 *
 * `articlePanierId` identifie l'article visé, selon le Propriétaire : pour un
 * Client, l'identifiant persisté de l'article du panier dans sa base ; pour un
 * Visiteur, le `variantId` porté par l'article de son cookie. Le module
 * interprète ce paramètre selon le Propriétaire courant.
 */
export async function retirerArticleDuPanier(
  proprietaire: ProprietairePanier,
  articlePanierId: string
): Promise<ResultatPanier> {
  if (proprietaire.role === "client") {
    return retirerArticleDuPanierClient(proprietaire.compteId, articlePanierId)
  }

  const articles = await lireArticlesPanierVisiteur()
  const restants = articles.filter(
    (article) => article.variantId !== articlePanierId
  )
  if (restants.length === articles.length) {
    return { ok: false, motif: MOTIF_ARTICLE_INCONNU }
  }

  await ecrirePanierVisiteur(restants)
  return { ok: true }
}

async function retirerArticleDuPanierClient(
  compteId: string,
  articlePanierId: string
): Promise<ResultatPanier> {
  const existing = await prisma.cartItem.findFirst({
    where: { id: articlePanierId, userId: compteId },
  })
  if (!existing) return { ok: false, motif: MOTIF_ARTICLE_INCONNU }

  await prisma.cartItem.delete({ where: { id: articlePanierId } })
  return { ok: true }
}

export async function ajouterArticleAuPanier(
  proprietaire: ProprietairePanier,
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (proprietaire.role === "client") {
    return ajouterArticleAuPanierClient(
      proprietaire.compteId,
      variantId,
      quantity
    )
  }

  const articles = await lireArticlesPanierVisiteur()
  const resultat = addToPanierVisiteur(articles, variantId, quantity)
  if (!resultat.ok) return { ok: false, motif: resultat.motif }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
  })
  if (!variant) return { ok: false, motif: MOTIF_VARIANTE_INCONNUE }

  await ecrirePanierVisiteur(resultat.articles)
  return { ok: true }
}

export async function rejouerPanierVisiteur(
  proprietaire: ProprietairePanier
): Promise<void> {
  if (proprietaire.role !== "client") return
  if (!(await possedeCookiePanierVisiteur())) return

  for (const article of await lireArticlesPanierVisiteur()) {
    try {
      await ajouterArticleAuPanierClient(
        proprietaire.compteId,
        article.variantId,
        article.quantity
      )
    } catch {
      // Article mort : le rejou est best-effort, il ne doit jamais bloquer.
    }
  }

  await supprimerCookiePanierVisiteur()
}

export async function compterArticlesDuPanier(
  proprietaire: ProprietairePanier
): Promise<number> {
  if (proprietaire.role === "client") {
    return compterArticlesDuPanierClient(proprietaire.compteId)
  }

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
}

async function compterArticlesDuPanierClient(
  compteId: string
): Promise<number> {
  const aggregate = await prisma.cartItem.aggregate({
    where: { userId: compteId },
    _sum: { quantity: true },
  })
  return aggregate._sum.quantity ?? 0
}

export async function lirePanier(
  proprietaire: ProprietairePanier
): Promise<DonneesPanier> {
  if (proprietaire.role === "client") {
    const items = await prisma.cartItem.findMany({
      where: { userId: proprietaire.compteId },
      orderBy: { createdAt: "asc" },
      include: { variant: { include: { product: true } } },
    })

    const lignes = items.map((item) =>
      construireArticleDuPanier(item.variant, item.quantity, item.id)
    )

    return { lines: lignes, ...calculerTotauxPanier(lignes) }
  }

  const articles = await lireArticlesPanierVisiteur()
  if (articles.length === 0) {
    return { lines: [], subtotal: 0, itemCount: 0 }
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: articles.map((article) => article.variantId) } },
    include: { product: true },
  })
  const parId = new Map(variants.map((variant) => [variant.id, variant]))

  const lignes: ArticleDuPanier[] = []
  for (const article of articles) {
    const variant = parId.get(article.variantId)
    if (!variant) continue
    lignes.push(construireArticleDuPanier(variant, article.quantity))
  }

  return { lines: lignes, ...calculerTotauxPanier(lignes) }
}

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
  quantity: number,
  articlePanierId: string = variant.id
): ArticleDuPanier {
  const unitPrice = variant.product.price + variant.priceDelta
  return {
    articlePanierId,
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
  lignes: readonly ArticleDuPanier[]
): Pick<DonneesPanier, "subtotal" | "itemCount"> {
  return {
    subtotal: lignes.reduce((somme, ligne) => somme + ligne.lineTotal, 0),
    itemCount: lignes.reduce((somme, ligne) => somme + ligne.quantity, 0),
  }
}

/**
 * Interface du Panier courant : la même lecture et les mêmes écritures que
 * l'interface à Propriétaire explicite, sans que l'appelant connaisse la
 * session. La résolution du Propriétaire du panier (session → Visiteur ou
 * Client) vit derrière l'interface comme aide privée. Le suffixe courant
 * distingue cette interface sans session de l'interface à Propriétaire
 * explicite, réservée aux appelants hors requête (création de Commande,
 * rejeu du Panier Visiteur à la connexion).
 *
 * `articlePanierId` garde son double sens documenté au contrat : pour un
 * Client, l'identifiant persisté de l'article du panier dans sa base ; pour
 * un Visiteur, le `variantId` porté par l'article de son cookie. Le module
 * interprète ce paramètre selon le Propriétaire courant, l'appelant ne
 * choisit jamais de branche.
 *
 * Le module ne rafraîchit rien : le rafraîchissement du routeur après
 * écriture réussie vit dans les adapteurs d'action de la boutique.
 */
async function resoudreProprietaireCourant(): Promise<ProprietairePanier> {
  // Import dynamique : un import statique tirerait `server-only` (via
  // get-session) dans chaque consommateur de l'interface à Propriétaire
  // explicite (création de Commande, Devis, suites sans session mockée).
  // Le mock `vi.mock("@/lib/use-cases/get-session")` de la suite de la
  // couture intercepte aussi cet import dynamique.
  const { getSessionUser } = await import("@/lib/use-cases/get-session")
  return resoudreProprietairePanier(await getSessionUser())
}

/** Lit le Panier courant (données complètes, tarifées depuis la base). */
export async function lirePanierCourant(): Promise<DonneesPanier> {
  return lirePanier(await resoudreProprietaireCourant())
}

/** Compte le Panier courant (somme des quantités seule). */
export async function compterArticlesDuPanierCourant(): Promise<number> {
  return compterArticlesDuPanier(await resoudreProprietaireCourant())
}

/** Ajoute une Variante (identifiant de Variante + quantité) au Panier courant. */
export async function ajouterArticleAuPanierCourant(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return ajouterArticleAuPanier(
    await resoudreProprietaireCourant(),
    variantId,
    quantity
  )
}

/**
 * Modifie la quantité d'un article du Panier courant.
 *
 * `articlePanierId` identifie l'article visé, selon le Propriétaire courant :
 * pour un Client, l'identifiant persisté de l'article du panier dans sa base ;
 * pour un Visiteur, le `variantId` porté par l'article de son cookie.
 */
export async function modifierQuantiteArticlePanierCourant(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  return modifierQuantiteArticlePanier(
    await resoudreProprietaireCourant(),
    articlePanierId,
    quantity
  )
}

/**
 * Retire un article du Panier courant.
 *
 * `articlePanierId` identifie l'article visé, selon le Propriétaire courant :
 * pour un Client, l'identifiant persisté de l'article du panier dans sa base ;
 * pour un Visiteur, le `variantId` porté par l'article de son cookie.
 */
export async function retirerArticleDuPanierCourant(
  articlePanierId: string
): Promise<ResultatPanier> {
  return retirerArticleDuPanier(
    await resoudreProprietaireCourant(),
    articlePanierId
  )
}
