import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  DemandePurge,
  PortPurgeEdge,
  ResultatPurgeEdge,
} from "@/lib/purge-edge"
import {
  BLOG_TAG,
  blogDetailTag,
  CATEGORY_TAG,
  categoryDetailTag,
  HOME_TAG,
  invalidateCatalogue,
  invalidateCommande,
  invalidateLivraison,
  invalidateProduits,
  invalidateStructure,
  demandeDePurge,
  PRODUCT_TAG,
  productDetailTag,
  tagsCatalogue,
  tagsStructure,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { revalidatePath, revalidateTag } from "next/cache"

const mockedRevalidateTag = vi.mocked(revalidateTag)
const mockedRevalidatePath = vi.mocked(revalidatePath)

const BASE = "https://eguidar.com"

function fauxPurgeEdge() {
  return {
    purger: vi.fn(
      async (_demande: DemandePurge): Promise<ResultatPurgeEdge> => ({
        ok: true,
        urls: [],
      })
    ),
  }
}

function evenementRenomme(
  overrides: Partial<CatalogueEventProduct> = {}
): CatalogueEventProduct {
  return {
    id: "p1",
    slug: "nouveau-slug",
    previousSlug: "ancien-slug",
    categoryChain: [{ slug: "racine" }, { slug: "telephones" }],
    ...overrides,
  }
}

describe("cache invalidation vocabulary", () => {
  it("exposes the storefront cache tag strings", () => {
    expect(PRODUCT_TAG).toBe("products")
    expect(CATEGORY_TAG).toBe("categories")
    expect(HOME_TAG).toBe("home")
    expect(BLOG_TAG).toBe("blog")
  })

  it("exposes the product detail tag builder", () => {
    expect(productDetailTag("mon-produit")).toBe("product:mon-produit")
  })

  it("exposes the category detail tag builder", () => {
    expect(categoryDetailTag("mon-telephone")).toBe("category:mon-telephone")
  })

  it("exposes the blog detail tag builder", () => {
    expect(blogDetailTag("mon-article")).toBe("blog:mon-article")
  })
})

describe("tagsCatalogue", () => {
  it("nomme le document du Produit, son ancien slug, ses Structures et l'accueil", () => {
    expect(
      tagsCatalogue(
        evenementRenomme({
          previousCategoryChain: [{ slug: "racine" }, { slug: "accessoires" }],
        })
      )
    ).toEqual([
      PRODUCT_TAG,
      productDetailTag("nouveau-slug"),
      productDetailTag("ancien-slug"),
      HOME_TAG,
      categoryDetailTag("racine"),
      categoryDetailTag("telephones"),
      categoryDetailTag("accessoires"),
    ])
  })

  it("ne répète ni le slug inchangé ni une Structure déjà nommée", () => {
    expect(
      tagsCatalogue({
        id: "p1",
        slug: "meme-slug",
        previousSlug: "meme-slug",
        categoryChain: [{ slug: "racine" }],
        previousCategoryChain: [{ slug: "racine" }],
      })
    ).toEqual([
      PRODUCT_TAG,
      productDetailTag("meme-slug"),
      HOME_TAG,
      categoryDetailTag("racine"),
    ])
  })

  it("nomme l'accueil et le catalogue entier pour une Structure", () => {
    expect(tagsStructure()).toEqual([CATEGORY_TAG, PRODUCT_TAG, HOME_TAG])
  })
})

describe("demandeDePurge", () => {
  it("traduit les tags d'un Produit renommé en documents absolus", () => {
    expect(demandeDePurge(tagsCatalogue(evenementRenomme()))).toEqual({
      kind: "urls",
      urls: [
        `${BASE}/produit/nouveau-slug`,
        `${BASE}/produit/ancien-slug`,
        `${BASE}/`,
        `${BASE}/categorie/racine`,
        `${BASE}/categorie/telephones`,
      ],
    })
  })

  it("purge aussi l'ancienne branche quand le Produit change de Structure", () => {
    expect(
      demandeDePurge(
        tagsCatalogue(
          evenementRenomme({
            previousSlug: undefined,
            previousCategoryChain: [
              { slug: "racine" },
              { slug: "accessoires" },
            ],
          })
        )
      )
    ).toEqual({
      kind: "urls",
      urls: [
        `${BASE}/produit/nouveau-slug`,
        `${BASE}/`,
        `${BASE}/categorie/racine`,
        `${BASE}/categorie/telephones`,
        `${BASE}/categorie/accessoires`,
      ],
    })
  })

  it("dédoublonne les documents que plusieurs tags nomment", () => {
    expect(
      demandeDePurge([
        HOME_TAG,
        categoryDetailTag("racine"),
        categoryDetailTag("racine"),
        HOME_TAG,
      ])
    ).toEqual({
      kind: "urls",
      urls: [`${BASE}/`, `${BASE}/categorie/racine`],
    })
  })

  it("purge tout le catalogue quand la Structure change", () => {
    expect(demandeDePurge(tagsStructure())).toEqual({ kind: "tout" })
  })

  it("purge tout le catalogue pour le tag catalogue sans document précis", () => {
    expect(demandeDePurge([PRODUCT_TAG])).toEqual({ kind: "tout" })
    expect(demandeDePurge([PRODUCT_TAG, HOME_TAG])).toEqual({ kind: "tout" })
  })

  it("reste précis quand le tag catalogue accompagne des documents nommés", () => {
    expect(
      demandeDePurge([PRODUCT_TAG, productDetailTag("mon-produit"), HOME_TAG])
    ).toEqual({
      kind: "urls",
      urls: [`${BASE}/produit/mon-produit`, `${BASE}/`],
    })
  })
})

describe("invalidateCatalogue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalide le produit, son ancien slug, ses Structures, le catalogue et l'accueil", async () => {
    const purgeEdge = fauxPurgeEdge()

    await invalidateCatalogue(
      evenementRenomme({
        previousCategoryChain: [{ slug: "racine" }, { slug: "accessoires" }],
      }),
      { purgeEdge }
    )

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(7)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(PRODUCT_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      productDetailTag("nouveau-slug"),
      "max"
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      productDetailTag("ancien-slug"),
      "max"
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith(HOME_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      categoryDetailTag("racine"),
      "max"
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      categoryDetailTag("telephones"),
      "max"
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      categoryDetailTag("accessoires"),
      "max"
    )
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/produits")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/produits/p1")
    expect(purgeEdge.purger).toHaveBeenCalledWith({
      kind: "urls",
      urls: [
        `${BASE}/produit/nouveau-slug`,
        `${BASE}/produit/ancien-slug`,
        `${BASE}/`,
        `${BASE}/categorie/racine`,
        `${BASE}/categorie/telephones`,
        `${BASE}/categorie/accessoires`,
      ],
    })
  })

  it("n'invalide pas deux fois un slug inchangé", async () => {
    const purgeEdge = fauxPurgeEdge()

    await invalidateCatalogue(
      {
        id: "p1",
        slug: "meme-slug",
        previousSlug: "meme-slug",
        categoryChain: [{ slug: "racine" }],
      },
      { purgeEdge }
    )

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(4)
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2)
    expect(purgeEdge.purger).toHaveBeenCalledWith({
      kind: "urls",
      urls: [
        `${BASE}/produit/meme-slug`,
        `${BASE}/`,
        `${BASE}/categorie/racine`,
      ],
    })
  })

  it("purge l'edge configuré avec les documents du Produit", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, errors: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const zoneInitiale = process.env.CLOUDFLARE_ZONE_ID
    const jetonInitial = process.env.CLOUDFLARE_API_TOKEN
    process.env.CLOUDFLARE_ZONE_ID = "zone-test"
    process.env.CLOUDFLARE_API_TOKEN = "jeton-test"
    try {
      await expect(
        invalidateCatalogue(evenementRenomme())
      ).resolves.toBeUndefined()

      expect(fetchSpy).toHaveBeenCalledOnce()
      const [url, init] = fetchSpy.mock.calls[0]!
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/zones/zone-test/purge_cache"
      )
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({
        files: [
          `${BASE}/produit/nouveau-slug`,
          `${BASE}/produit/ancien-slug`,
          `${BASE}/`,
          `${BASE}/categorie/racine`,
          `${BASE}/categorie/telephones`,
        ],
      })
    } finally {
      fetchSpy.mockRestore()
      if (zoneInitiale === undefined) delete process.env.CLOUDFLARE_ZONE_ID
      else process.env.CLOUDFLARE_ZONE_ID = zoneInitiale
      if (jetonInitial === undefined) delete process.env.CLOUDFLARE_API_TOKEN
      else process.env.CLOUDFLARE_API_TOKEN = jetonInitial
    }
  })

  it("sans identifiants Cloudflare, la purge est un no-op journalisé", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const zoneInitiale = process.env.CLOUDFLARE_ZONE_ID
    const jetonInitial = process.env.CLOUDFLARE_API_TOKEN
    delete process.env.CLOUDFLARE_ZONE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
    try {
      await expect(
        invalidateCatalogue(evenementRenomme())
      ).resolves.toBeUndefined()

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        "purge de l'edge non effectuée"
      )
      expect(warnSpy.mock.calls[0]?.[0]).toContain("non-configure")
    } finally {
      fetchSpy.mockRestore()
      warnSpy.mockRestore()
      if (zoneInitiale === undefined) delete process.env.CLOUDFLARE_ZONE_ID
      else process.env.CLOUDFLARE_ZONE_ID = zoneInitiale
      if (jetonInitial === undefined) delete process.env.CLOUDFLARE_API_TOKEN
      else process.env.CLOUDFLARE_API_TOKEN = jetonInitial
    }
  })

  it("ne lève pas quand la purge de l'edge est indisponible, et la journalise", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const purgeEdge: PortPurgeEdge = {
      purger: vi.fn(async (): Promise<ResultatPurgeEdge> => ({
        ok: false,
        erreur: {
          code: "non-configure",
          message:
            "Cloudflare n'est pas configuré : renseignez CLOUDFLARE_ZONE_ID et CLOUDFLARE_API_TOKEN",
        },
      })),
    }
    try {
      await expect(
        invalidateCatalogue(evenementRenomme(), { purgeEdge })
      ).resolves.toBeUndefined()

      expect(mockedRevalidateTag).toHaveBeenCalledWith(PRODUCT_TAG, "max")
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        "purge de l'edge non effectuée"
      )
      expect(warnSpy.mock.calls[0]?.[0]).toContain("CLOUDFLARE_ZONE_ID")
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("ne lève pas quand le transport de purge se lève, et le journalise", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const purgeEdge: PortPurgeEdge = {
      purger: vi.fn(async () => {
        throw new Error("réseau indisponible")
      }),
    }
    try {
      await expect(
        invalidateCatalogue(evenementRenomme(), { purgeEdge })
      ).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0]?.[1]).toBeInstanceOf(Error)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("invalidateProduits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("revalide les mêmes tags qu'un enregistrement et purge leurs documents en un appel", async () => {
    const purgeEdge = fauxPurgeEdge()

    await invalidateProduits(
      [
        {
          id: "p1",
          slug: "produit-a",
          categoryChain: [{ slug: "racine" }],
        },
        {
          id: "p2",
          slug: "produit-b",
          categoryChain: [{ slug: "racine" }],
        },
      ],
      { purgeEdge }
    )

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(5)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(PRODUCT_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      productDetailTag("produit-a"),
      "max"
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      productDetailTag("produit-b"),
      "max"
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith(HOME_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      categoryDetailTag("racine"),
      "max"
    )
    expect(mockedRevalidatePath).not.toHaveBeenCalled()
    expect(purgeEdge.purger).toHaveBeenCalledOnce()
    expect(purgeEdge.purger).toHaveBeenCalledWith({
      kind: "urls",
      urls: [
        `${BASE}/produit/produit-a`,
        `${BASE}/`,
        `${BASE}/categorie/racine`,
        `${BASE}/produit/produit-b`,
      ],
    })
  })

  it("ne revalide ni ne purge rien quand aucun Produit n'est touché", async () => {
    const purgeEdge = fauxPurgeEdge()

    await invalidateProduits([], { purgeEdge })

    expect(mockedRevalidateTag).not.toHaveBeenCalled()
    expect(mockedRevalidatePath).not.toHaveBeenCalled()
    expect(purgeEdge.purger).not.toHaveBeenCalled()
  })
})

describe("invalidateStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalide les Structures, le catalogue et l'accueil, puis purge tout le catalogue", async () => {
    const purgeEdge = fauxPurgeEdge()

    await invalidateStructure({ purgeEdge })

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(3)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(CATEGORY_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(PRODUCT_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(HOME_TAG, "max")
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/categories")
    expect(purgeEdge.purger).toHaveBeenCalledWith({ kind: "tout" })
  })

  it("ne lève pas quand la purge de l'edge est indisponible", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const purgeEdge: PortPurgeEdge = {
      purger: vi.fn(async (): Promise<ResultatPurgeEdge> => ({
        ok: false,
        erreur: { code: "erreur-purge", message: "HTTP 503" },
      })),
    }
    try {
      await expect(invalidateStructure({ purgeEdge })).resolves.toBeUndefined()
      expect(mockedRevalidateTag).toHaveBeenCalledWith(CATEGORY_TAG, "max")
      expect(warnSpy).toHaveBeenCalledOnce()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("invalidateLivraison", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("revalidates the admin villes and livraison pages without touching cache tags", () => {
    invalidateLivraison()

    expect(mockedRevalidateTag).not.toHaveBeenCalled()
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/villes")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/livraison")
  })
})

describe("invalidateCommande", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the admin and customer order pages for the order", () => {
    invalidateCommande("order-42")

    expect(mockedRevalidateTag).not.toHaveBeenCalled()
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(5)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/commandes")
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      "/admin/commandes/order-42"
    )
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/commandes")
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      "/commande/confirmation/order-42"
    )
  })
})
