import { describe, expect, it } from "vitest"

import {
  calculerTotauxPanier,
  construireArticleDuPanier,
  creerPanierStore,
  type ArticleStockePanier,
  type CataloguePanier,
  type DonneesPanier,
  type StockagePanier,
} from "@/lib/panier-coeur"

/**
 * Stockage en mémoire sur la couture interne : un tableau d'Articles
 * stockés bruts. `ajouterQuantite` fusionne de façon additive,
 * `definirQuantite` fixe, `retirerArticle` retire et rapporte. Les
 * lectures projetées composent les projections pures du cœur.
 */
function stockageEnMemoire(
  faits: Pick<StockagePanier, "capArticlesMax" | "motifIdentifiantVide">
): StockagePanier & { articles: ArticleStockePanier[] } {
  const articles: ArticleStockePanier[] = []
  return {
    articles,
    ...faits,
    async lire(): Promise<DonneesPanier> {
      const lignes = articles.map((article) =>
        construireArticleDuPanier(variante(article.variantId), article.quantity)
      )
      return { lines: lignes, ...calculerTotauxPanier(lignes) }
    },
    async compter(): Promise<number> {
      return articles.reduce((somme, article) => somme + article.quantity, 0)
    },
    async lireArticlesStockes(): Promise<ArticleStockePanier[]> {
      return articles.map((article) => ({ ...article }))
    },
    async possedeArticle(variantId: string): Promise<boolean> {
      return articles.some((article) => article.variantId === variantId)
    },
    async ajouterQuantite(variantId: string, quantity: number): Promise<void> {
      const existant = articles.find(
        (article) => article.variantId === variantId
      )
      if (existant) existant.quantity += quantity
      else articles.push({ variantId, quantity })
    },
    async definirQuantite(variantId: string, quantity: number): Promise<void> {
      const existant = articles.find(
        (article) => article.variantId === variantId
      )
      if (existant) existant.quantity = quantity
    },
    async retirerArticle(variantId: string): Promise<boolean> {
      const avant = articles.length
      const restants = articles.filter(
        (article) => article.variantId !== variantId
      )
      articles.splice(0, articles.length, ...restants)
      return articles.length < avant
    },
  }
}

/** Faux Catalogue : la Variante existe si le prédicat le dit. */
function catalogueFake(
  existe: (variantId: string) => boolean
): CataloguePanier {
  return { existe: async (variantId) => existe(variantId) }
}

function variante(id: string) {
  return {
    id,
    name: `Variante ${id}`,
    productId: `produit-${id}`,
    priceDelta: 0,
    stock: 10,
    product: {
      price: 1000,
      name: `Produit ${id}`,
      slug: `produit-${id}`,
      images: null,
      freeShipping: false,
    },
  }
}

const VARIANTE_INCONNUE = "variante-fantome"

function stockageAvecCap() {
  return stockageEnMemoire({ capArticlesMax: 2 })
}

function stockageVisiteur() {
  return stockageEnMemoire({ motifIdentifiantVide: "quantite-invalide" })
}

function stockageClient() {
  return stockageEnMemoire({ motifIdentifiantVide: "variante-inconnue" })
}

function stockageSansFait() {
  return stockageEnMemoire({})
}

const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

describe("couture interne : creerPanierStore (ajouter)", () => {
  it("refuse la quantité invalide (0, -1, 1.5) avec le message exact", async () => {
    for (const quantity of [0, -1, 1.5]) {
      const stockage = stockageVisiteur()
      const store = creerPanierStore(
        stockage,
        catalogueFake(() => true)
      )
      expect(await store.ajouter("variante-a", quantity)).toEqual({
        ok: false,
        motif: "quantite-invalide",
        message: MESSAGE_QUANTITE_INVALIDE,
      })
      expect(stockage.articles).toEqual([])
    }
  })

  it("replie l'identifiant vide sur le motif déclaré : quantite-invalide (Visiteur)", async () => {
    const stockage = stockageVisiteur()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    expect(await store.ajouter("", 2)).toEqual({
      ok: false,
      motif: "quantite-invalide",
      message: MESSAGE_QUANTITE_INVALIDE,
    })
    expect(stockage.articles).toEqual([])
  })

  it("replie l'identifiant vide sur le motif déclaré : variante-inconnue (Client)", async () => {
    const stockage = stockageClient()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    expect(await store.ajouter("", 2)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([])
  })

  it("laisse l'identifiant vide tomber jusqu'au manqué du Catalogue sans motif déclaré", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake((id) => id !== "")
    )
    expect(await store.ajouter("", 2)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([])
  })

  it("refuse l'ajout au plafond avec le message interpolé depuis la capacité", async () => {
    const stockage = stockageAvecCap()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    expect(await store.ajouter("variante-a", 1)).toEqual({ ok: true })
    expect(await store.ajouter("variante-b", 1)).toEqual({ ok: true })
    expect(await store.ajouter("variante-c", 1)).toEqual({
      ok: false,
      motif: "cap-atteinte",
      message: "Votre panier est plein : 2 articles maximum.",
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 1 },
      { variantId: "variante-b", quantity: 1 },
    ])
  })

  it("fusionne un Article existant au plafond (le plafond ne refuse pas la fusion)", async () => {
    const stockage = stockageAvecCap()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 1)
    await store.ajouter("variante-b", 1)
    expect(await store.ajouter("variante-a", 3)).toEqual({ ok: true })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 4 },
      { variantId: "variante-b", quantity: 1 },
    ])
  })

  it("ne refuse jamais cap-atteinte sans plafond déclaré", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    for (let i = 0; i < 5; i++) {
      expect(await store.ajouter(`variante-${i}`, 1)).toEqual({ ok: true })
    }
    expect(stockage.articles).toHaveLength(5)
  })

  it("refuse la Variante inconnue avec le message exact (plafonné)", async () => {
    const stockage = stockageAvecCap()
    const store = creerPanierStore(
      stockage,
      catalogueFake((id) => id !== VARIANTE_INCONNUE)
    )
    expect(await store.ajouter(VARIANTE_INCONNUE, 1)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([])
  })

  it("refuse la Variante inconnue avec le message exact (non plafonné)", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake((id) => id !== VARIANTE_INCONNUE)
    )
    expect(await store.ajouter(VARIANTE_INCONNUE, 1)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([])
  })

  it("ajoute additivement et répond ok", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    await store.ajouter("variante-a", 3)
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 5 },
    ])
  })

  it("précédence : quantité avant plafond avant Variante", async () => {
    const stockage = stockageAvecCap()
    const catalogue = catalogueFake((id) => id !== VARIANTE_INCONNUE)
    const store = creerPanierStore(stockage, catalogue)
    // Quantité invalide gagne même avec Catalogue manqué.
    expect(await store.ajouter(VARIANTE_INCONNUE, 0)).toEqual({
      ok: false,
      motif: "quantite-invalide",
      message: MESSAGE_QUANTITE_INVALIDE,
    })
    // Plafond gagne avant la revalidation de la Variante (au plafond).
    await store.ajouter("variante-a", 1)
    await store.ajouter("variante-b", 1)
    expect(await store.ajouter(VARIANTE_INCONNUE, 1)).toEqual({
      ok: false,
      motif: "cap-atteinte",
      message: "Votre panier est plein : 2 articles maximum.",
    })
    // Variante gagne quand le plafond n'est pas atteint.
    await store.retirer("variante-a")
    expect(await store.ajouter(VARIANTE_INCONNUE, 1)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-b", quantity: 1 },
    ])
  })
})

describe("couture interne : creerPanierStore (modifier)", () => {
  it("refuse la quantité invalide (0, -1, 1.5) avec le message exact", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    for (const quantity of [0, -1, 1.5]) {
      expect(await store.modifier("variante-a", quantity)).toEqual({
        ok: false,
        motif: "quantite-invalide",
        message: MESSAGE_QUANTITE_INVALIDE,
      })
      expect(stockage.articles).toEqual([
        { variantId: "variante-a", quantity: 2 },
      ])
    }
  })

  it("refuse l'Article inconnu avec le message exact", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    expect(await store.modifier("variante-b", 1)).toEqual({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })

  it("refuse l'identifiant vide comme Article inconnu", async () => {
    const stockage = stockageVisiteur()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    expect(await store.modifier("", 1)).toEqual({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })

  it("revalide la Variante pour un stockage plafonné", async () => {
    const stockage = stockageAvecCap()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => false)
    )
    // Article présent sans Variante vivante : seed direct du stockage
    // (chez le Client, une ligne persistée ne survit pas à sa Variante ;
    // le stockage en mémoire permet d'épingler la règle quand même).
    stockage.articles.push({ variantId: "variante-a", quantity: 2 })
    expect(await store.modifier("variante-a", 3)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })

  it("revalide la Variante pour un stockage non plafonné", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => false)
    )
    stockage.articles.push({ variantId: "variante-a", quantity: 2 })
    expect(await store.modifier("variante-a", 3)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })

  it("fixe la quantité et répond ok", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    expect(await store.modifier("variante-a", 5)).toEqual({ ok: true })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 5 },
    ])
  })

  it("précédence : quantité avant Article avant Variante", async () => {
    const stockage = stockageSansFait()
    const catalogue = catalogueFake(() => false)
    const store = creerPanierStore(stockage, catalogue)
    stockage.articles.push({ variantId: "variante-a", quantity: 2 })
    // Quantité invalide gagne même avec Catalogue toujours manqué.
    expect(await store.modifier("variante-a", 0)).toEqual({
      ok: false,
      motif: "quantite-invalide",
      message: MESSAGE_QUANTITE_INVALIDE,
    })
    // Article inconnu gagne avant la revalidation de la Variante.
    expect(await store.modifier("variante-b", 1)).toEqual({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    })
    // Variante gagne pour un Article présent.
    expect(await store.modifier("variante-a", 3)).toEqual({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })
})

describe("couture interne : creerPanierStore (retirer)", () => {
  it("refuse l'Article inconnu avec le message exact", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    expect(await store.retirer("variante-b")).toEqual({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })

  it("refuse l'identifiant vide comme Article inconnu", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    expect(await store.retirer("")).toEqual({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    })
    expect(stockage.articles).toEqual([
      { variantId: "variante-a", quantity: 2 },
    ])
  })

  it("retire l'Article connu sans vérifier quantité ni Variante", async () => {
    const stockage = stockageSansFait()
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => false)
    )
    stockage.articles.push({ variantId: "variante-a", quantity: 2 })
    stockage.articles.push({ variantId: "variante-b", quantity: 1 })
    expect(await store.retirer("variante-a")).toEqual({ ok: true })
    expect(stockage.articles).toEqual([
      { variantId: "variante-b", quantity: 1 },
    ])
  })
})

describe("couture interne : lire et compter délèguent au stockage", () => {
  it("lire retourne la projection du stockage", async () => {
    const stockage = stockageEnMemoire({})
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    await store.ajouter("variante-b", 1)
    const panier = await store.lire()
    expect(
      panier.lines.map((ligne) => [ligne.variantId, ligne.quantity])
    ).toEqual([
      ["variante-a", 2],
      ["variante-b", 1],
    ])
    expect(panier.subtotal).toBe(3000)
    expect(panier.itemCount).toBe(3)
    expect(Object.keys(panier).sort()).toEqual([
      "itemCount",
      "lines",
      "subtotal",
    ])
  })

  it("compter retourne la somme des quantités du stockage", async () => {
    const stockage = stockageEnMemoire({})
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    await store.ajouter("variante-a", 2)
    await store.ajouter("variante-b", 1)
    expect(await store.compter()).toBe(3)
  })

  it("compte et lit un Panier vide", async () => {
    const stockage = stockageEnMemoire({})
    const store = creerPanierStore(
      stockage,
      catalogueFake(() => true)
    )
    expect(await store.compter()).toBe(0)
    expect(await store.lire()).toEqual({ lines: [], subtotal: 0, itemCount: 0 })
  })
})
