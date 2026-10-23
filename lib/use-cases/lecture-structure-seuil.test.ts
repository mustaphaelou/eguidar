import { describe, expect, it } from "vitest"

import {
  sourceApres,
  sourceDuCorpus,
  sourcesDeProduction,
  avecSource,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"
import {
  FORME,
  MODULE_LECTURE,
  sitesDeLecture,
  type SiteLecture,
} from "@/test/lecture-structure-outils"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)

interface ExceptionLecture {
  chemin: string
  voie: "delegue" | "relation"
  extrait: string
  declaration: string
  herite: boolean
  raison: string
}

const SITES_NOMMES: ExceptionLecture[] = [
  {
    chemin: "lib/acces-catalogue-build.ts",
    voie: "delegue",
    extrait: `prisma.${FORME.delegue}.count`,
    declaration: "lireLesFaitsDuCatalogue",
    herite: false,
    raison:
      "le compte des catégories qui dit si le catalogue du build est vide : aucune rangée ne nomme sa place dans l'arbre, aucun nom n'est lu",
  },
  {
    chemin: "lib/use-cases/admin-catalog.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "ecrireCreation",
    herite: false,
    raison:
      "le nom de la catégorie dans le Document d'index du produit que la transaction vient d'écrire : le pointeur d'une seule rangée, pas sa place dans l'arbre",
  },
  {
    chemin: "lib/use-cases/admin-catalog.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "produitDeLaTentative",
    herite: false,
    raison:
      "le nom de la catégorie du Produit déjà enregistré que la tentative reprend : le pointeur d'une seule rangée, pas sa place dans l'arbre",
  },
  {
    chemin: "lib/use-cases/admin-catalog.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "ecrireMiseAJour",
    herite: false,
    raison:
      "le nom de la catégorie dans le Document d'index du produit relu après une suppression : le pointeur d'une seule rangée, pas sa place dans l'arbre",
  },
  {
    chemin: "lib/use-cases/admin-catalog.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "updateVariantStock",
    herite: false,
    raison:
      "le nom de la catégorie dans le Document d'index du produit portant la variante dont le stock change : le pointeur d'une seule rangée, atteinte par deux joins, pas sa place dans l'arbre",
  },
  {
    chemin: "lib/use-cases/admin-catalog.ts",
    voie: "relation",
    extrait: `select: ${FORME.champ}`,
    declaration: "listAdminProducts",
    herite: false,
    raison:
      "le seul nom de la catégorie dans la liste des Produits de l'Administration : une chaîne d'une seule rangée, pas sa place dans l'arbre",
  },
  {
    chemin: "lib/use-cases/admin-dashboard.ts",
    voie: "delegue",
    extrait: `prisma.${FORME.delegue}.count`,
    declaration: "getDashboardStats",
    herite: true,
    raison: "le compte de Structures du tableau de bord",
  },
  {
    chemin: "lib/use-cases/admin-structure.ts",
    voie: "delegue",
    extrait: `client.${FORME.delegue}.findUnique`,
    declaration: "assertUniqueCategorySlug",
    herite: false,
    raison:
      "l'unicité du slug d'une Structure : l'existence d'une seule rangée portant ce slug, pas sa place dans l'arbre",
  },
  {
    chemin: "lib/use-cases/admin-structure.ts",
    voie: "delegue",
    extrait: `client.${FORME.delegue}.findUnique`,
    declaration: "assertCategoryParent",
    herite: false,
    raison:
      "la présence du parent visé : l'existence d'une seule rangée par cet identifiant, pas la chaîne de ses ancêtres",
  },
  {
    chemin: "lib/use-cases/admin-structure.ts",
    voie: "delegue",
    extrait: `tx.${FORME.delegue}.findUnique`,
    declaration: "updateCategory",
    herite: false,
    raison:
      "l'image de la rangée qu'on s'apprête à réécrire : une seule rangée par son identifiant, pas ses voisines",
  },
  {
    chemin: "lib/use-cases/admin-structure.ts",
    voie: "delegue",
    extrait: `tx.${FORME.delegue}.findUnique`,
    declaration: "deleteCategory",
    herite: false,
    raison:
      "les enfants et les produits d'une Structure qu'on supprime, pour décider d'un refus : des identifiants de rangées voisines, pas la topologie",
  },
  {
    chemin: "lib/use-cases/admin-structure.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "readIndexableCategoryProducts",
    herite: false,
    raison:
      "le nom de la catégorie dans les Documents d'index des Produits d'une Structure réaffectée : le pointeur d'une seule rangée, la topologie restant à la Marche",
  },
  {
    chemin: "lib/use-cases/admin-structure.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "deleteCategory",
    herite: false,
    raison:
      "le nom de la catégorie dans les Documents d'index des Produits détachés d'une Structure supprimée : le pointeur d'une seule rangée, la topologie restant à la Marche",
  },
  {
    chemin: MODULE_LECTURE,
    voie: "delegue",
    extrait: `prisma.${FORME.delegue}.findMany`,
    declaration: "lireToutesLesStructures",
    herite: true,
    raison: "le propriétaire de la lecture (ADR-0030)",
  },
  {
    chemin: "lib/use-cases/storefront.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "fetchProductPageData",
    herite: false,
    raison:
      "le nom de la catégorie du produit affiché, pour amorcer son fil d'Ariane : le pointeur d'une seule rangée, la descente restant à la Lecture",
  },
  {
    chemin: "prisma/seed.ts",
    voie: "delegue",
    extrait: `prisma.${FORME.delegue}.findUniqueOrThrow`,
    declaration: "main",
    herite: true,
    raison: "outillage d'exploitation : la rangée que le seed vient d'écrire",
  },
  {
    chemin: "prisma/seed.ts",
    voie: "relation",
    extrait: `include: ${FORME.champ}`,
    declaration: "main",
    herite: false,
    raison:
      "le nom de la catégorie dans les Documents d'index écrits par l'outillage d'exploitation : le pointeur d'une seule rangée, pas sa place dans l'arbre",
  },
]

function cle({
  chemin,
  voie,
  extrait,
  declaration,
}: Omit<ExceptionLecture, "herite" | "raison">): string {
  return `${chemin} ${voie} ${extrait} dans ${declaration}`
}

function sites(sources: readonly SourceProduction[]): SiteLecture[] {
  return sitesDeLecture(sources, FORME)
}

function clesTrouvees(sources: readonly SourceProduction[]): string[] {
  return sites(sources).map(cle).sort()
}

function clesNommees(): string[] {
  return SITES_NOMMES.map(cle).sort()
}

function registre(sources: readonly SourceProduction[]): string {
  const trouvees = sites(sources).map(
    (site) =>
      `${site.chemin}:${site.ligne} ${site.voie} ${site.extrait} dans ${site.declaration}`
  )
  const cles = new Set(clesTrouvees(sources))
  const orphelines = SITES_NOMMES.filter(
    (entree) => !cles.has(cle(entree))
  ).map(
    ({ chemin, voie, extrait, declaration, raison }) =>
      `${chemin}:sans-lecture ${voie} ${extrait} dans ${declaration} — ${raison}`
  )
  return [...trouvees, ...orphelines].join("\n")
}

function ligneDe(chemin: string, ligne: number): string {
  return sourceDuCorpus(SOURCES, chemin).source.split("\n")[ligne - 1]!
}

describe("Lecture de la Structure — le seuil de lecture, site par site", () => {
  it("chaque lecture trouvée est un site nommé, et chaque site nommé a une lecture derrière lui", () => {
    expect(SITES_NOMMES.length).toBeGreaterThan(10)
    expect(new Set(clesNommees()).size).toBe(SITES_NOMMES.length)
    expect(clesTrouvees(SOURCES), registre(SOURCES)).toEqual(clesNommees())

    const cles = new Set(clesTrouvees(SOURCES))
    for (const entree of SITES_NOMMES) {
      expect(entree.raison.length, cle(entree)).toBeGreaterThan(0)
      expect(
        cles,
        `${cle(entree)} n'a aucune lecture derrière sa raison`
      ).toContain(cle(entree))
    }
  })

  it("la liste s'élargit des quatorze entrées d'ici, chacune avec sa raison propre", () => {
    const raisons = SITES_NOMMES.map(({ raison }) => raison)
    expect(raisons).toHaveLength(new Set(raisons).size)

    const trouves = sites(SOURCES)
    for (const entree of SITES_NOMMES) {
      const introuvable = cle(entree)
      expect(entree.raison.length, introuvable).toBeGreaterThan(0)

      const site = trouves.find((autre) => cle(autre) === introuvable)
      expect(
        site,
        `${introuvable} n'a aucune lecture derrière sa raison`
      ).toBeDefined()

      expect(ligneDe(entree.chemin, site!.ligne), introuvable).toContain(
        entree.voie === "delegue" ? entree.extrait : FORME.champ
      )
    }

    const heritees = SITES_NOMMES.filter(({ herite }) => herite)
    expect(heritees.length).toBe(3)
    expect(SITES_NOMMES).toHaveLength(17)
    expect(SITES_NOMMES).toHaveLength(heritees.length + 14)

    const attenduesParVoie = { relation: 9, delegue: 8 }
    for (const voie of ["relation", "delegue"] as const) {
      expect(
        SITES_NOMMES.filter((site) => site.voie === voie).length,
        voie
      ).toBe(attenduesParVoie[voie])
    }
  })

  it("une entrée suit sa lecture, et non sa place parmi les autres", () => {
    const cible = "lib/use-cases/admin-structure.ts"
    const reel = sourceDuCorpus(SOURCES, cible).source
    const avant = clesTrouvees(SOURCES)
    expect(avant).toEqual(clesNommees())

    const enViolation = reel.replace(
      `const existing = await client.${FORME.delegue}.findUnique({ where: { slug } })`,
      [
        `const existing = await client.${FORME.delegue}.findUnique({ where: { slug } })`,
        `const doublon = await client.${FORME.delegue}.findUnique({ where: { id } })`,
      ].join("\n")
    )
    expect(enViolation).not.toBe(reel)

    const apres = clesTrouvees(avecSource(SOURCES, cible, enViolation))
    expect(apres).not.toEqual(avant)
    expect(apres).toHaveLength(avant.length + 1)

    const parLe = (liste: string[], declaration: string) =>
      liste.filter((cle) => cle.endsWith(`dans ${declaration}`)).sort()
    expect(parLe(apres, "assertCategoryParent")).toEqual(
      parLe(avant, "assertCategoryParent")
    )
    expect(parLe(apres, "assertUniqueCategorySlug")).toEqual(
      [
        ...parLe(avant, "assertUniqueCategorySlug"),
        `lib/use-cases/admin-structure.ts delegue client.${FORME.delegue}.findUnique dans assertUniqueCategorySlug`,
      ].sort()
    )
  })

  it("deux lectures de même forme dans une même déclaration se nomment deux fois", () => {
    const source = [
      `export async function compter() {`,
      `  return Promise.all([`,
      `    prisma.${FORME.delegue}.count(),`,
      `    prisma.${FORME.delegue}.count(),`,
      `  ])`,
      `}`,
      "",
    ].join("\n")
    expect(clesTrouvees([{ chemin: "lib/deux.ts", source }])).toEqual([
      `lib/deux.ts delegue prisma.${FORME.delegue}.count dans compter`,
      `lib/deux.ts delegue prisma.${FORME.delegue}.count dans compter`,
    ])
    expect(clesNommees()).not.toContain(
      `lib/deux.ts delegue prisma.${FORME.delegue}.count dans compter`
    )
  })

  it("la garde tombe sur une relation plantée dans un fichier réel, et se tait sur le reste", () => {
    const cible = "lib/use-cases/blog.ts"
    const reel = sourceDuCorpus(SOURCES, cible).source
    expect(clesTrouvees(SOURCES)).toEqual(clesNommees())

    const enViolation = sourceApres(
      reel,
      `const parRang = await prisma.product.findMany({ include: { ${FORME.champ}: true } })`
    )
    expect(enViolation).not.toBe(reel)
    expect(
      clesTrouvees(avecSource(SOURCES, cible, enViolation)),
      registre(avecSource(SOURCES, cible, enViolation))
    ).toEqual(
      [
        ...clesNommees(),
        `${cible} relation ${`include: ${FORME.champ}`} dans parRang`,
      ].sort()
    )
  })

  it("une lecture par Transaction est vue, et se nomme comme les autres", () => {
    const cible = "lib/use-cases/blog.ts"
    const reel = sourceDuCorpus(SOURCES, cible).source

    const enTransaction = sourceApres(
      reel,
      `const parTransaction = await tx.${FORME.delegue}.findUnique({ where: { id } })`
    )
    expect(enTransaction).not.toBe(reel)
    expect(clesTrouvees(avecSource(SOURCES, cible, enTransaction))).toEqual(
      [
        ...clesNommees(),
        `${cible} delegue ${`tx.${FORME.delegue}.findUnique`} dans parTransaction`,
      ].sort()
    )

    for (const [recepteur, attendues, declarations] of [
      ["tx", 2, ["updateCategory", "deleteCategory"]],
      ["client", 2, ["assertUniqueCategorySlug", "assertCategoryParent"]],
    ] as const) {
      const nommes = SITES_NOMMES.filter(
        ({ chemin, extrait, voie }) =>
          voie === "delegue" &&
          chemin === "lib/use-cases/admin-structure.ts" &&
          extrait.startsWith(`${recepteur}.${FORME.delegue}.`)
      )
      expect(
        nommes.map(({ extrait }) => extrait),
        recepteur
      ).toEqual(
        Array.from(
          { length: attendues },
          () => `${recepteur}.${FORME.delegue}.findUnique`
        )
      )
      expect(
        nommes.map(({ declaration }) => declaration),
        recepteur
      ).toEqual([...declarations])
    }
  })

  it("une raison sans lecture derrière elle fait tomber la garde", () => {
    const boutique = "lib/use-cases/storefront.ts"
    const sansRelation = sourceDuCorpus(SOURCES, boutique).source.replace(
      `include: { ${FORME.champ}: true,`,
      "include: {"
    )
    expect(sansRelation).not.toBe(sourceDuCorpus(SOURCES, boutique).source)

    const corpus = avecSource(SOURCES, boutique, sansRelation)
    const trouvees = clesTrouvees(corpus)
    expect(trouvees).not.toEqual(clesNommees())
    expect(trouvees.filter((cle) => cle.startsWith(boutique))).toEqual([])
    expect(clesNommees().filter((cle) => cle.startsWith(boutique)).length).toBe(
      1
    )
    expect(registre(corpus)).toContain(`${boutique}:sans-lecture`)
  })
})
