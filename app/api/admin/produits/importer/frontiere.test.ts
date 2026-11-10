import { describe, expect, it } from "vitest"

import {
  avecSource,
  importeDe,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const ROUTE_MODELE = "app/api/admin/produits/importer/modele/route.ts"

// La route de téléchargement ne peut pas passer par `adminJsonRoute` : la
// porte JSON ne rend que du JSON. Cette garde-là est donc la sienne, jumelle
// de celle des routes de téléversement, et elle exige la Session courante et
// le rôle administrateur explicitement.
const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../../..",
  "../../../../../components",
  "../../../../../lib"
)

function contournementsDe({ chemin, source }: SourceProduction): string[] {
  const trouves: string[] = []

  if (importeDe(source, "lib/db")) {
    trouves.push(`${chemin} importe la base de données`)
  }
  if (!/\blireSession\b/.test(source)) {
    trouves.push(`${chemin} ne lit pas la Session courante`)
  }
  if (!/\bestAdmin\b/.test(source)) {
    trouves.push(`${chemin} ne vérifie pas le rôle administrateur`)
  }
  if (/\badminJsonRoute\b/.test(source)) {
    trouves.push(`${chemin} passe par la porte JSON`)
  }
  if (/\bResponse\s*\.\s*json\s*\(/.test(source)) {
    trouves.push(`${chemin} construit une réponse JSON`)
  }
  if (!/Content-Disposition/.test(source)) {
    trouves.push(`${chemin} n'annonce pas le téléchargement`)
  }
  if (!/text\/csv/.test(source)) {
    trouves.push(`${chemin} ne déclare pas le type CSV`)
  }

  return trouves
}

function contournements(sources: readonly SourceProduction[]): string[] {
  const route = sources.find(({ chemin }) => chemin === ROUTE_MODELE)
  return route === undefined
    ? [`${ROUTE_MODELE} est absente du corpus`]
    : contournementsDe(route)
}

describe("Administration — la route du modèle d'import", () => {
  it("le parcours est non vacuant : il voit la route et ne signale rien", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toContain(ROUTE_MODELE)
    expect(contournements(SOURCES)).toEqual([])
  })
})

describe("Administration — la garde sait nommer le contournement", () => {
  it("signale une route qui importe la base", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_MODELE)

    expect(
      contournements(
        avecSource(
          SOURCES,
          ROUTE_MODELE,
          `${route.source}\nimport { prisma } from "@/lib/db"\nvoid prisma\n`
        )
      )
    ).toEqual([`${ROUTE_MODELE} importe la base de données`])
  })

  it("signale une route qui ne lit plus la Session", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_MODELE)
    const sansSession = route.source.replace(
      /\blireSession\b/g,
      "sessionDuRequeteur"
    )

    expect(sansSession).not.toBe(route.source)
    expect(
      contournements(avecSource(SOURCES, ROUTE_MODELE, sansSession))
    ).toEqual([`${ROUTE_MODELE} ne lit pas la Session courante`])
  })

  it("signale une route qui ne vérifie plus le rôle", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_MODELE)
    const sansRole = route.source.replace(/\bestAdmin\b/g, "estConnecte")

    expect(sansRole).not.toBe(route.source)
    expect(contournements(avecSource(SOURCES, ROUTE_MODELE, sansRole))).toEqual(
      [`${ROUTE_MODELE} ne vérifie pas le rôle administrateur`]
    )
  })

  it("signale une route qui repasse par la porte JSON", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_MODELE)

    expect(
      contournements(
        avecSource(
          SOURCES,
          ROUTE_MODELE,
          `${route.source}\nimport { adminJsonRoute } from "@/lib/use-cases/admin-json-route"\nvoid adminJsonRoute\n`
        )
      )
    ).toEqual([`${ROUTE_MODELE} passe par la porte JSON`])
  })
})
