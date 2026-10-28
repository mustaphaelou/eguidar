import { describe, expect, it } from "vitest"

import {
  carte,
  sourceApres,
  sourceDuCorpus,
  sourcesDeProduction,
  avecSource,
} from "@/lib/use-cases/outils-frontiere"
import {
  BANIERE_GENEREE,
  ECRITURES_DELEGUEES,
  FORME,
  SCHEMA,
  estGeneree,
  formeDeLaStructure,
  modelesLus,
  sitesDeLecture,
} from "@/test/lecture-structure-outils"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)

function sourceDe(chemin: string): string {
  return sourceDuCorpus(SOURCES, chemin).source
}

function formes(sources: Parameters<typeof sitesDeLecture>[0]) {
  return sitesDeLecture(sources, FORME).map(
    (site) => `${site.voie}:${site.extrait}`
  )
}

describe("Lecture de la Structure — la reconnaissance de la lecture", () => {
  it("la forme se lit dans le dépôt, et le dépôt la confirme", () => {
    expect(modelesLus().length).toBeGreaterThan(10)
    expect(SCHEMA).toContain(`model ${FORME.modele} {`)
    expect(SCHEMA).toContain(`model ${FORME.porteur} {`)
    expect(FORME).toEqual({
      modele: "Category",
      delegue: "category",
      porteur: "Product",
      champ: "category",
    })

    const genereDuModele = sourceDe(
      `lib/generated/prisma/models/${FORME.modele}.ts`
    )
    const genereDuPorteur = sourceDe(
      `lib/generated/prisma/models/${FORME.porteur}.ts`
    )
    expect(genereDuModele).toContain(`prisma.${FORME.delegue}.findMany`)
    expect(genereDuModele).toContain(`["${FORME.delegue}"]`)
    expect(genereDuPorteur).toContain(`${FORME.champ}?: Prisma.XOR<`)
  })

  it("un renommage de la forme déplace la cible au lieu de la désarmer", () => {
    const renomme = SCHEMA.replaceAll("Category", "Groupe").replaceAll(
      "category",
      "groupe"
    )
    expect(renomme).not.toBe(SCHEMA)
    expect(renomme).not.toContain("Category")
    expect(renomme).not.toContain("category")

    const cible = formeDeLaStructure(renomme)
    expect(cible).toEqual({
      modele: "Groupe",
      delegue: "groupe",
      porteur: "Product",
      champ: "groupe",
    })

    for (const [source, voie, extrait] of [
      ["await prisma.groupe.findMany()", "delegue", "prisma.groupe.findMany"],
      [
        "await prisma.product.findMany({ include: { groupe: true } })",
        "relation",
        "include: groupe",
      ],
    ]) {
      expect(
        sitesDeLecture([{ chemin: "lib/forme.ts", source }], cible).map(
          (site) => `${site.voie}:${site.extrait}`
        ),
        source
      ).toEqual([`${voie}:${extrait}`])
    }

    for (const source of [
      "await prisma.category.findMany()",
      "await prisma.product.findMany({ include: { category: true } })",
    ]) {
      expect(
        sitesDeLecture([{ chemin: "lib/forme.ts", source }], cible),
        source
      ).toEqual([])
      expect(
        sitesDeLecture([{ chemin: "lib/forme.ts", source }], FORME),
        source
      ).not.toEqual([])
    }

    const deuxArbres = [
      renomme,
      "model Jumeau {",
      "  parentId String?",
      "  parent   Jumeau? @relation(fields: [parentId], references: [id])",
      "}",
      "",
    ].join("\n")
    expect(() => formeDeLaStructure(deuxArbres)).toThrow(/une seule Structure/)
  })

  it("le délégué est vu par tout récepteur, la Transaction et la poignée comprises", () => {
    for (const recepteur of ["prisma", "tx", "client", "session"]) {
      const source = `await ${recepteur}.${FORME.delegue}.findUnique({ where: { id } })`
      expect(
        sitesDeLecture([{ chemin: "lib/forme.ts", source }], FORME).map(
          ({ voie, delegation, extrait }) => `${voie}:${delegation}:${extrait}`
        ),
        recepteur
      ).toEqual([`delegue:findUnique:${recepteur}.${FORME.delegue}.findUnique`])
    }
  })

  it("la relation est vue par toute rangée qui l'amène, d'un niveau ou de deux", () => {
    for (const [source, voie, extrait] of [
      [
        `await prisma.product.findUnique({ include: { ${FORME.champ}: true } })`,
        "relation",
        `include: ${FORME.champ}`,
      ],
      [
        `await prisma.product.findMany({ include: { variants: true, ${FORME.champ}: true } })`,
        "relation",
        `include: ${FORME.champ}`,
      ],
      [
        `await prisma.product.findMany({ select: { ${FORME.champ}: { select: { name: true } } } })`,
        "relation",
        `select: ${FORME.champ}`,
      ],
      [
        `await prisma.productVariant.findUnique({ include: { product: { include: { ${FORME.champ}: true, variants: true } } } })`,
        "relation",
        `include: ${FORME.champ}`,
      ],
      [
        `await prisma.product.findMany({ include: { ${FORME.champ}: { include: { products: true } } } })`,
        "relation",
        `include: ${FORME.champ}`,
      ],
    ]) {
      expect(formes([{ chemin: "lib/forme.ts", source }]), source).toEqual([
        `${voie}:${extrait}`,
      ])
    }

    for (const source of [
      "await prisma.product.findMany({ include: { variants: true } })",
      "await prisma.product.findMany({ where: { categoryId: null } })",
      "await prisma.product.findMany({ where: { category: { is: null } } })",
      "await prisma.product.update({ data: { categoryId: null } })",
      "await prisma.product.create({ data: { category: { connect: { id } } } })",
      "const nom = produit.category.nom",
    ]) {
      expect(
        sitesDeLecture([{ chemin: "lib/forme.ts", source }], FORME),
        source
      ).toEqual([])
    }
  })

  it("la reconnaissance voit des formes qu'aucune source de production n'écrit", () => {
    const formesVues: [string, string, string][] = [
      [
        `await prisma["${FORME.delegue}"].findMany()`,
        "delegue",
        `prisma["${FORME.delegue}"].findMany`,
      ],
      [
        `await prisma?.${FORME.delegue}?.findMany()`,
        "delegue",
        `prisma?.${FORME.delegue}?.findMany`,
      ],
      [
        `await prisma.product.findMany({ select: { ${FORME.champ}: true } })`,
        "relation",
        `select: ${FORME.champ}`,
      ],
      [
        `await prisma.product.findMany({ include: { ${FORME.champ}: { include: { products: true } } } })`,
        "relation",
        `include: ${FORME.champ}`,
      ],
      [
        `await tx.${FORME.delegue}.aggregate({ _count: true })`,
        "delegue",
        `tx.${FORME.delegue}.aggregate`,
      ],
    ]
    expect(formesVues.length).toBeGreaterThanOrEqual(5)

    for (const [forme, voie, extrait] of formesVues) {
      expect(
        SOURCES.filter(({ source }) => source.includes(forme)).map(
          ({ chemin }) => chemin
        ),
        forme
      ).toEqual([])
      expect(
        formes([{ chemin: "lib/forme.ts", source: forme }]),
        forme
      ).toEqual([`${voie}:${extrait}`])
    }
  })

  it("le délégué est vu qu'il soit lié, décomposé, ou appelé en optionnel", () => {
    const cas: [string, string, string][] = [
      [
        `const { ${FORME.delegue} } = prisma\nawait ${FORME.delegue}.findMany()`,
        "delegue",
        `${FORME.delegue}.findMany`,
      ],
      [
        `const { ${FORME.delegue}: rangee } = prisma\nawait rangee.findUnique({ where: { id } })`,
        "delegue",
        `rangee.findUnique`,
      ],
      [
        `const poignee = prisma.${FORME.delegue}\nawait poignee.findFirst()`,
        "delegue",
        `poignee.findFirst`,
      ],
      [
        `await prisma.${FORME.delegue}.findMany?.()`,
        "delegue",
        `prisma.${FORME.delegue}.findMany`,
      ],
    ]
    expect(cas.length).toBeGreaterThanOrEqual(4)

    for (const [forme, voie, extrait] of cas) {
      expect(
        SOURCES.filter(({ source }) => source.includes(forme)).map(
          ({ chemin }) => chemin
        ),
        forme
      ).toEqual([])
      expect(
        formes([{ chemin: "lib/forme.ts", source: forme }]),
        forme
      ).toEqual([`${voie}:${extrait}`])
    }
  })

  it("un nom qui n'est pas le délégué ne réveille rien, et un nom lié sans appel non plus", () => {
    for (const source of [
      `const { produit } = prisma\nawait produit.findMany()`,
      `const { produit: ${FORME.delegue} } = prisma\nawait ${FORME.delegue}.toUpperCase()`,
      `const { ${FORME.delegue} } = prisma`,
      `const alias = prisma.${FORME.delegue}`,
      `const ${FORME.delegue} = 1\n${FORME.delegue}.toUpperCase()`,
    ]) {
      expect(
        sitesDeLecture([{ chemin: "lib/forme.ts", source }], FORME),
        source
      ).toEqual([])
    }
  })

  it("les écritures restent exemptées, et la liste tient dans ce que le client génère", () => {
    expect(ECRITURES_DELEGUEES.size).toBeGreaterThan(0)

    const genere = sourceDe(`lib/generated/prisma/models/${FORME.modele}.ts`)
    const documentees = new Set(
      [
        ...genere.matchAll(
          new RegExp(`prisma\\.${FORME.delegue}\\.([A-Za-z]+)`, "g")
        ),
      ].map(([, delegation]) => delegation!)
    )
    expect(documentees).toContain("findMany")

    for (const delegation of ECRITURES_DELEGUEES) {
      expect(documentees, delegation).toContain(delegation)
      for (const recepteur of ["prisma", "tx", "client"]) {
        expect(
          sitesDeLecture(
            [
              {
                chemin: "lib/forme.ts",
                source: `await ${recepteur}.${FORME.delegue}.${delegation}({})`,
              },
            ],
            FORME
          ),
          `${recepteur}.${delegation}`
        ).toEqual([])
      }
    }
  })

  it("les sources générées restent exclues, et l'exclusion n'est pas un trou", () => {
    const generees = SOURCES.filter(({ chemin }) => estGeneree(chemin))
    expect(generees.length).toBeGreaterThan(0)
    for (const { chemin, source } of generees) {
      expect(source, chemin).toContain(BANIERE_GENEREE)
    }

    const porteuses = generees.filter(
      ({ source }) =>
        sitesDeLecture([{ chemin: "lib/genere.ts", source }], FORME).length > 0
    )
    expect(porteuses.map(({ chemin }) => chemin)).toContain(
      `lib/generated/prisma/models/${FORME.modele}.ts`
    )
    expect(porteuses.length).toBeGreaterThan(0)
    expect(sitesDeLecture(generees, FORME)).toEqual([])
  })

  it("la reconnaissance nomme le site, et tombe sur une violation écrite dans un fichier réel", () => {
    const cible = "lib/use-cases/blog.ts"
    const reel = sourceDe(cible)
    expect(sitesDeLecture(SOURCES, FORME).length).toBeGreaterThan(10)
    expect(
      sitesDeLecture(SOURCES, FORME).filter(
        ({ chemin: trouve }) => trouve === cible
      )
    ).toEqual([])

    const enViolation = sourceApres(
      reel,
      [
        `const parTransaction = await tx.${FORME.delegue}.findUnique({ where: { id } })`,
        `const parPoignee = await client.${FORME.delegue}.findFirst()`,
        `const parRang = await prisma.product.findMany({ include: { ${FORME.champ}: true } })`,
        `const ecrit = await prisma.${FORME.delegue}.update({ data: { name: "x" } })`,
      ].join("\n")
    )
    expect(enViolation).not.toBe(reel)

    const sitesDuFichier = sitesDeLecture(
      avecSource(SOURCES, cible, enViolation),
      FORME
    ).filter(({ chemin: trouve }) => trouve === cible)
    expect(sitesDuFichier).toEqual([
      {
        chemin: cible,
        ligne: 2,
        voie: "delegue",
        delegation: "findUnique",
        extrait: `tx.${FORME.delegue}.findUnique`,
        declaration: "parTransaction",
      },
      {
        chemin: cible,
        ligne: 3,
        voie: "delegue",
        delegation: "findFirst",
        extrait: `client.${FORME.delegue}.findFirst`,
        declaration: "parPoignee",
      },
      {
        chemin: cible,
        ligne: 4,
        voie: "relation",
        delegation: null,
        extrait: `include: ${FORME.champ}`,
        declaration: "parRang",
      },
    ])
  })

  it("la reconnaissance se prouve sur le dépôt réel, pas sur un exemple", () => {
    expect(SOURCES.length).toBeGreaterThan(200)

    const trouves = sitesDeLecture(SOURCES, FORME)
    expect(trouves).toHaveLength(19)
    expect(trouves.filter(({ voie }) => voie === "relation")).toHaveLength(11)
    expect(trouves.filter(({ voie }) => voie === "delegue")).toHaveLength(8)
    expect(trouves.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "lib/use-cases/lecture-structure.ts",
        "lib/use-cases/storefront.ts",
        "lib/use-cases/admin-structure.ts",
        "lib/use-cases/admin-catalog.ts",
        "lib/use-cases/admin-dashboard.ts",
        "prisma/seed.ts",
      ])
    )

    for (const [recepteur, attendues] of [
      ["prisma", 4],
      ["tx", 2],
      ["client", 2],
    ] as const) {
      expect(
        trouves.filter(({ extrait }) =>
          extrait.startsWith(`${recepteur}.${FORME.delegue}.`)
        ),
        recepteur
      ).toHaveLength(attendues)
    }
    expect(
      trouves
        .filter(({ extrait }) => extrait === `select: ${FORME.champ}`)
        .map(({ chemin }) => chemin)
    ).toEqual(["lib/use-cases/admin-catalog.ts"])
  })

  it("le seuil de reconnaissance ne se voit pas lui-même", () => {
    expect(carte(SOURCES).has("test/lecture-structure-outils.ts")).toBe(false)
    expect(SOURCES.some(({ chemin }) => chemin.startsWith("test/"))).toBe(false)
  })
})
