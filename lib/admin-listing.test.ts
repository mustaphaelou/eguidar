import { describe, expect, expectTypeOf, it } from "vitest"

import {
  defineAdminListing,
  PAGE_SIZES,
  type AdminListingDescriptor,
  type ListingParamsOf,
  type PageSize,
} from "@/lib/admin-listing"

function descriptor(
  overrides: Partial<AdminListingDescriptor> = {}
): AdminListingDescriptor {
  return {
    path: "/admin/exemple",
    sortColumns: ["date", "total"],
    defaultSort: "date",
    defaultPageSize: 10,
    filters: {},
    ...overrides,
  }
}

const GRAMMAIRE = defineAdminListing({
  path: "/admin/exemple",
  sortColumns: ["date", "total"],
  defaultSort: "date",
  defaultPageSize: 10,
  filters: {
    statuses: {
      kind: "multi-enum",
      param: "statut",
      values: ["pending", "returned"],
    },
    stock: { kind: "single-enum", values: ["zero", "non-zero"] },
    structure: { kind: "single-token" },
    misEnAvant: { kind: "boolean-flag" },
  },
})

describe("PAGE_SIZES", () => {
  it("expose la liste fermée des tailles de page", () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50])
  })
})

describe("defineAdminListing — validation du descripteur", () => {
  it("rejette un chemin sans slash initial ou portant ? ou #", () => {
    for (const path of [
      "admin/exemple",
      "/admin/exemple?",
      "/admin/exemple#",
    ]) {
      expect(() => defineAdminListing(descriptor({ path }))).toThrow()
    }
  })

  it("rejette des colonnes de tri vides ou dupliquées", () => {
    expect(() => defineAdminListing(descriptor({ sortColumns: [] }))).toThrow()
    expect(() =>
      defineAdminListing(descriptor({ sortColumns: ["date", "date"] }))
    ).toThrow()
  })

  it("rejette un tri par défaut absent des colonnes de tri", () => {
    expect(() =>
      defineAdminListing(descriptor({ defaultSort: "poids" }))
    ).toThrow()
  })

  it("rejette une taille de page hors de PAGE_SIZES", () => {
    expect(() =>
      defineAdminListing(descriptor({ defaultPageSize: 25 as PageSize }))
    ).toThrow()
  })

  it("rejette un paramètre de filtre réservé ou dupliqué", () => {
    for (const param of ["page", "pageSize", "q", "tri", "sens"]) {
      expect(() =>
        defineAdminListing(
          descriptor({
            filters: { premiere: { kind: "single-token", param } },
          })
        )
      ).toThrow()
    }
    expect(() =>
      defineAdminListing(
        descriptor({
          filters: {
            premiere: { kind: "single-token", param: "statut" },
            deuxieme: { kind: "single-token", param: "statut" },
          },
        })
      )
    ).toThrow()
  })

  it("rejette deux filtres partageant un columnId", () => {
    expect(() =>
      defineAdminListing(
        descriptor({
          filters: {
            premiere: { kind: "single-token", columnId: "stock" },
            deuxieme: {
              kind: "single-enum",
              values: ["zero"],
              columnId: "stock",
            },
          },
        })
      )
    ).toThrow()
  })

  it("rejette des valeurs énumérées vides, dupliquées ou avec une virgule", () => {
    expect(() =>
      defineAdminListing(
        descriptor({
          filters: { stock: { kind: "single-enum", values: [] } },
        })
      )
    ).toThrow()
    expect(() =>
      defineAdminListing(
        descriptor({
          filters: { stock: { kind: "single-enum", values: ["zero", "zero"] } },
        })
      )
    ).toThrow()
    expect(() =>
      defineAdminListing(
        descriptor({
          filters: {
            statut: { kind: "multi-enum", values: ["pending,bogus"] },
          },
        })
      )
    ).toThrow()
  })

  it("gèle les métadonnées résolues", () => {
    const listing = defineAdminListing(
      descriptor({
        filters: {
          stock: { kind: "single-enum", values: ["zero", "non-zero"] },
        },
      })
    )

    expect(Object.isFrozen(listing)).toBe(true)
    expect(Object.isFrozen(listing.sortColumns)).toBe(true)
    expect(Object.isFrozen(listing.defaults)).toBe(true)
    expect(Object.isFrozen(listing.filters)).toBe(true)
    expect(Object.isFrozen(listing.filters[0])).toBe(true)
    expect(Object.isFrozen(listing.filters[0].values)).toBe(true)
    expect(listing.filters[0]).toMatchObject({
      key: "stock",
      kind: "single-enum",
      param: "stock",
      columnId: "stock",
    })
  })
})

describe("defineAdminListing — buildUrl", () => {
  it("émet les paramètres dans l'ordre canonique et omits les défauts", () => {
    expect(GRAMMAIRE.buildUrl({})).toBe("/admin/exemple")
    expect(
      GRAMMAIRE.buildUrl({
        page: 3,
        pageSize: 20,
        q: " alix ",
        statuses: ["pending", "returned"],
        stock: "zero",
        structure: " categorie-1 ",
        misEnAvant: true,
        tri: "total",
        sens: "asc",
      })
    ).toBe(
      "/admin/exemple?page=3&pageSize=20&q=alix&statut=pending%2Creturned&stock=zero&structure=categorie-1&misEnAvant=1&tri=total&sens=asc"
    )
  })

  it("ne rien émet quand toutes les valeurs sont par défaut", () => {
    expect(
      GRAMMAIRE.buildUrl({
        page: 1,
        pageSize: 10,
        q: "   ",
        statuses: [],
        misEnAvant: false,
        tri: "date",
        sens: "desc",
      })
    ).toBe("/admin/exemple")
  })

  it("projette chaque des quatre genres de filtre", () => {
    expect(GRAMMAIRE.buildUrl({ statuses: ["returned", "pending"] })).toBe(
      "/admin/exemple?statut=returned%2Cpending"
    )
    expect(GRAMMAIRE.buildUrl({ stock: "non-zero" })).toBe(
      "/admin/exemple?stock=non-zero"
    )
    expect(GRAMMAIRE.buildUrl({ structure: "sans_structure" })).toBe(
      "/admin/exemple?structure=sans_structure"
    )
    expect(GRAMMAIRE.buildUrl({ misEnAvant: true })).toBe(
      "/admin/exemple?misEnAvant=1"
    )
  })
})

describe("defineAdminListing — parse", () => {
  it("lit une requête complète quel que soit l'ordre des paramètres", () => {
    expect(
      GRAMMAIRE.parse({
        sens: "asc",
        misEnAvant: "1",
        structure: " categorie-1 ",
        tri: "total",
        statut: "pending, bogus ,returned,pending",
        q: " alix ",
        pageSize: "20",
        page: "3",
        stock: "zero",
      })
    ).toEqual({
      page: 3,
      pageSize: 20,
      q: "alix",
      statuses: ["pending", "returned"],
      stock: "zero",
      structure: "categorie-1",
      misEnAvant: true,
      tri: "total",
      sens: "asc",
    })
  })

  it("ne jette jamais sur une entrée malformée et garde la première valeur", () => {
    expect(() =>
      GRAMMAIRE.parse({
        page: ["3", "9"],
        pageSize: ["20", "50"],
        q: [" alix ", "autre"],
      })
    ).not.toThrow()
    expect(
      GRAMMAIRE.parse({ page: ["3", "9"], pageSize: "abc", q: "   " })
    ).toMatchObject({ page: 3, pageSize: 10 })

    expect(
      GRAMMAIRE.parse({
        statut: "",
        stock: "inconnu",
        structure: "  ",
        misEnAvant: "oui",
        tri: "poids",
        sens: "upward",
      })
    ).toEqual({
      page: 1,
      pageSize: 10,
      tri: "date",
      sens: "desc",
    })
  })

  it("ne lève pas sur une requête dupliquée ou vide", () => {
    expect(() => GRAMMAIRE.parse({ statuses: ["pending"] })).not.toThrow()
    expect(GRAMMAIRE.parse({})).toEqual({
      page: 1,
      pageSize: 10,
      tri: "date",
      sens: "desc",
    })
  })
})

describe("ListingParamsOf", () => {
  it("infère les types d'une entité à partir du descripteur", () => {
    type Params = ListingParamsOf<typeof GRAMMAIRE>

    expectTypeOf<Params["statuses"]>().toEqualTypeOf<
      ("pending" | "returned")[] | undefined
    >()
    expectTypeOf<Params["stock"]>().toEqualTypeOf<
      "zero" | "non-zero" | undefined
    >()
    expectTypeOf<Params["structure"]>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Params["misEnAvant"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Params["tri"]>().toEqualTypeOf<"date" | "total" | undefined>()
    expectTypeOf<Params["pageSize"]>().toEqualTypeOf<PageSize | undefined>()
  })
})
