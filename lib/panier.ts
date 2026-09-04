import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  MESSAGE_CAP_ATTEINTE,
  NOM_COOKIE_PANIER_VISITEUR,
  addToPanierVisiteur,
  parsePanierVisiteur,
  quantiteValide,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"

const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

/**
 * @deprecated Compatibilité transitoire (#190-#192 la retire) : le
 * Propriétaire du panier est résolu en interne par l'interface canonique.
 */
export type ProprietairePanier =
  { role: "visiteur" } | { role: "client"; compteId: string }

export type MotifRefusPanier =
  "cap-atteinte" | "quantite-invalide" | "variante-inconnue" | "article-inconnu"

export type ResultatPanier =
  { ok: true } | { ok: false; motif: MotifRefusPanier; message: string }

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

/**
 * @deprecated Compatibilité transitoire (#190-#192 la retire) : la
 * résolution du Propriétaire vit derrière l'interface canonique.
 */
export function resoudreProprietairePanier(
  user: { id: string } | null
): ProprietairePanier {
  return user ? { role: "client", compteId: user.id } : { role: "visiteur" }
}

async function resoudreProprietaireCourant(): Promise<ProprietairePanier> {
  // Import dynamique : un import statique tirerait `server-only` (via
  // get-session) dans chaque consommateur sans session mockée. Le mock
  // `vi.mock("@/lib/use-cases/get-session")` intercepte cet import dynamique.
  const { getSessionUser } = await import("@/lib/use-cases/get-session")
  return resoudreProprietairePanier(await getSessionUser())
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
}

async function modifierQuantiteArticlePanierClient(
  compteId: string,
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (!quantiteValide(quantity)) {
    return {
      ok: false,
      motif: "quantite-invalide",
      message: MESSAGE_QUANTITE_INVALIDE,
    }
  }
  const existing = await prisma.cartItem.findFirst({
    where: { id: articlePanierId, userId: compteId },
  })
  if (!existing) {
    return {
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }
  }

  await prisma.cartItem.update({
    where: { id: articlePanierId },
    data: { quantity },
  })
  return { ok: true }
}

async function retirerArticleDuPanierClient(
  compteId: string,
  articlePanierId: string
): Promise<ResultatPanier> {
  const existing = await prisma.cartItem.findFirst({
    where: { id: articlePanierId, userId: compteId },
  })
  if (!existing) {
    return {
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }
  }

  await prisma.cartItem.delete({ where: { id: articlePanierId } })
  return { ok: true }
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

async function panierLire(
  proprietaire: ProprietairePanier
): Promise<DonneesPanier> {
  if (proprietaire.role === "client") {
    return lirePanierClient(proprietaire.compteId)
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

async function panierCompter(
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

async function panierAjouter(
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
}

async function panierModifier(
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
    return {
      ok: false,
      motif: "quantite-invalide",
      message: MESSAGE_QUANTITE_INVALIDE,
    }
  }

  const articles = await lireArticlesPanierVisiteur()
  if (!articles.some((article) => article.variantId === articlePanierId)) {
    return {
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: articlePanierId },
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
      article.variantId === articlePanierId ? { ...article, quantity } : article
    )
  )
  return { ok: true }
}

async function panierRetirer(
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
    return {
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }
  }

  await ecrirePanierVisiteur(restants)
  return { ok: true }
}

/**
 * Lit le Panier du Visiteur ou du Client courant : la résolution du
 * Propriétaire (session → Client, sinon cookie Visiteur) vit derrière
 * l'interface, l'appelant ne choisit jamais de branche.
 *
 * `articlePanierId` garde son double sens au contrat : pour un Client,
 * l'identifiant persisté de l'article du panier dans sa base ; pour un
 * Visiteur, le `variantId` porté par l'article de son cookie.
 */
export function lirePanier(): Promise<DonneesPanier>
/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez lirePanier() sans argument. */
export function lirePanier(
  proprietaire: ProprietairePanier
): Promise<DonneesPanier>
export async function lirePanier(
  proprietaire?: ProprietairePanier
): Promise<DonneesPanier> {
  return panierLire(proprietaire ?? (await resoudreProprietaireCourant()))
}

/** Compte le Panier courant (somme des quantités). */
export function compterArticlesDuPanier(): Promise<number>
/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez compterArticlesDuPanier() sans argument. */
export function compterArticlesDuPanier(
  proprietaire: ProprietairePanier
): Promise<number>
export async function compterArticlesDuPanier(
  proprietaire?: ProprietairePanier
): Promise<number> {
  return panierCompter(proprietaire ?? (await resoudreProprietaireCourant()))
}

/** Ajoute une Variante (identifiant de Variante + quantité) au Panier courant. */
export function ajouterArticleAuPanier(
  variantId: string,
  quantity: number
): Promise<ResultatPanier>
/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez ajouterArticleAuPanier(variantId, quantity). */
export function ajouterArticleAuPanier(
  proprietaire: ProprietairePanier,
  variantId: string,
  quantity: number
): Promise<ResultatPanier>
export async function ajouterArticleAuPanier(
  proprietaireOuVariantId: ProprietairePanier | string,
  variantIdOuQuantity: string | number,
  quantityCompat?: number
): Promise<ResultatPanier> {
  if (typeof proprietaireOuVariantId === "string") {
    return panierAjouter(
      await resoudreProprietaireCourant(),
      proprietaireOuVariantId,
      variantIdOuQuantity as number
    )
  }
  return panierAjouter(
    proprietaireOuVariantId,
    variantIdOuQuantity as string,
    quantityCompat as number
  )
}

/**
 * Modifie la quantité d'un article du Panier courant.
 *
 * `articlePanierId` identifie l'article visé, selon le Propriétaire courant :
 * pour un Client, l'identifiant persisté de l'article du panier dans sa base ;
 * pour un Visiteur, le `variantId` porté par l'article de son cookie.
 */
export function modifierQuantiteArticlePanier(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier>
/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez modifierQuantiteArticlePanier(articlePanierId, quantity). */
export function modifierQuantiteArticlePanier(
  proprietaire: ProprietairePanier,
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier>
export async function modifierQuantiteArticlePanier(
  articlePanierIdOuProprietaire: string | ProprietairePanier,
  quantityOuArticlePanierId: number | string,
  quantityCompat?: number
): Promise<ResultatPanier> {
  if (typeof articlePanierIdOuProprietaire === "string") {
    return panierModifier(
      await resoudreProprietaireCourant(),
      articlePanierIdOuProprietaire,
      quantityOuArticlePanierId as number
    )
  }
  return panierModifier(
    articlePanierIdOuProprietaire,
    quantityOuArticlePanierId as string,
    quantityCompat as number
  )
}

/**
 * Retire un article du Panier courant.
 *
 * `articlePanierId` identifie l'article visé, selon le Propriétaire courant :
 * pour un Client, l'identifiant persisté de l'article du panier dans sa base ;
 * pour un Visiteur, le `variantId` porté par l'article de son cookie.
 */
export function retirerArticleDuPanier(
  articlePanierId: string
): Promise<ResultatPanier>
/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez retirerArticleDuPanier(articlePanierId). */
export function retirerArticleDuPanier(
  proprietaire: ProprietairePanier,
  articlePanierId: string
): Promise<ResultatPanier>
export async function retirerArticleDuPanier(
  articlePanierIdOuProprietaire: string | ProprietairePanier,
  articlePanierIdCompat?: string
): Promise<ResultatPanier> {
  if (typeof articlePanierIdOuProprietaire === "string") {
    return panierRetirer(
      await resoudreProprietaireCourant(),
      articlePanierIdOuProprietaire
    )
  }
  return panierRetirer(
    articlePanierIdOuProprietaire,
    articlePanierIdCompat as string
  )
}

/**
 * Lit directement le Panier persisté d'un Compte client en base, sans
 * toucher aux cookies : couture dédiée à l'intake de la Commande
 * (`placeOrder`), découplée de toute requête navigateur.
 */
export async function lirePanierClient(
  compteId: string
): Promise<DonneesPanier> {
  const items = await prisma.cartItem.findMany({
    where: { userId: compteId },
    orderBy: { createdAt: "asc" },
    include: { variant: { include: { product: true } } },
  })

  const lignes = items.map((item) =>
    construireArticleDuPanier(item.variant, item.quantity, item.id)
  )

  return { lines: lignes, ...calculerTotauxPanier(lignes) }
}

/**
 * Rejoue le Panier Visiteur (cookie) d'un Compte client dans son Panier
 * persisté, puis supprime le cookie : couture dédiée au callback
 * d'authentification, qui prend l'identifiant du compte directement.
 * Le rejeu est best-effort : un article mort ne le bloque jamais.
 */
export function rejouerPanierVisiteur(compteId: string): Promise<void>
/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez rejouerPanierVisiteur(compteId). */
export function rejouerPanierVisiteur(
  proprietaire: ProprietairePanier
): Promise<void>
export async function rejouerPanierVisiteur(
  compteIdOuProprietaire: string | ProprietairePanier
): Promise<void> {
  const compteId =
    typeof compteIdOuProprietaire === "string"
      ? compteIdOuProprietaire
      : compteIdOuProprietaire.role === "client"
        ? compteIdOuProprietaire.compteId
        : null
  if (!compteId) return
  if (!(await possedeCookiePanierVisiteur())) return

  for (const article of await lireArticlesPanierVisiteur()) {
    try {
      await ajouterArticleAuPanierClient(
        compteId,
        article.variantId,
        article.quantity
      )
    } catch {
      // Article mort : le rejeu est best-effort, il ne doit jamais bloquer.
    }
  }

  await supprimerCookiePanierVisiteur()
}

/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez lirePanier(). */
export async function lirePanierCourant(): Promise<DonneesPanier> {
  return lirePanier()
}

/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez compterArticlesDuPanier(). */
export async function compterArticlesDuPanierCourant(): Promise<number> {
  return compterArticlesDuPanier()
}

/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez ajouterArticleAuPanier(variantId, quantity). */
export async function ajouterArticleAuPanierCourant(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return ajouterArticleAuPanier(variantId, quantity)
}

/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez modifierQuantiteArticlePanier(articlePanierId, quantity). */
export async function modifierQuantiteArticlePanierCourant(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  return modifierQuantiteArticlePanier(articlePanierId, quantity)
}

/** @deprecated Compatibilité transitoire (#190-#192 la retire) : appelez retirerArticleDuPanier(articlePanierId). */
export async function retirerArticleDuPanierCourant(
  articlePanierId: string
): Promise<ResultatPanier> {
  return retirerArticleDuPanier(articlePanierId)
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
