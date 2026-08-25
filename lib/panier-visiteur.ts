export const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"

export const MAX_ARTICLES_PANIER_VISITEUR = 20

export const MESSAGE_CAP_ATTEINTE = `Votre panier est plein : ${MAX_ARTICLES_PANIER_VISITEUR} articles maximum.`

export interface ArticlePanierVisiteur {
  variantId: string
  quantity: number
}

export type MotifRefusPanierVisiteur = "cap-atteinte" | "quantite-invalide"

export type AjoutPanierVisiteur =
  | { ok: true; articles: ArticlePanierVisiteur[] }
  | {
      ok: false
      motif: MotifRefusPanierVisiteur
      articles: ArticlePanierVisiteur[]
    }

export function quantiteValide(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1
}

function estArticleValide(
  article: unknown
): article is ArticlePanierVisiteur {
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

export function serializePanierVisiteur(
  articles: readonly ArticlePanierVisiteur[]
): string {
  return JSON.stringify(normaliser(articles))
}

export function parsePanierVisiteur(
  raw?: string | null
): ArticlePanierVisiteur[] {
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

export function addToPanierVisiteur(
  articles: readonly ArticlePanierVisiteur[],
  variantId: string,
  quantity: number
): AjoutPanierVisiteur {
  const actuels = normaliser(articles)
  if (variantId.length === 0 || !quantiteValide(quantity)) {
    return { ok: false, motif: "quantite-invalide", articles: actuels }
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
    return { ok: false, motif: "cap-atteinte", articles: actuels }
  }
  return { ok: true, articles: [...actuels, { variantId, quantity }] }
}

export function mergePaniersVisiteur(
  gauche: readonly ArticlePanierVisiteur[],
  droite: readonly ArticlePanierVisiteur[]
): ArticlePanierVisiteur[] {
  return normaliser([...gauche, ...droite])
}
