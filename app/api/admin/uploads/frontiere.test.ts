import { describe, expect, it } from "vitest"

import {
  avecSource,
  importeDe,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const ROUTE_LIBERATION = "app/api/admin/uploads/delete/route.ts"
const ROUTE_PRESIGNATION = "app/api/admin/uploads/presign/route.ts"

const ROUTES_SURVEILLEES = [ROUTE_LIBERATION, ROUTE_PRESIGNATION] as const

const PORTE = "lib/use-cases/admin-json-route"
const SESSION = "lib/use-cases/session-courante"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../..",
  "../../../../components",
  "../../../../lib"
)

function contournementsDe({ chemin, source }: SourceProduction): string[] {
  const trouves: string[] = []

  if (!importeDe(source, PORTE)) {
    trouves.push(
      `${chemin} n’importe pas adminJsonRoute depuis @/lib/use-cases/admin-json-route`
    )
  }
  if (importeDe(source, SESSION)) {
    trouves.push(`${chemin} importe la session courante`)
  }
  if (/\blireSession\b/.test(source)) {
    trouves.push(`${chemin} lit la session`)
  }
  if (/\bestAdmin\b/.test(source)) {
    trouves.push(`${chemin} vérifie le rôle`)
  }
  if (/\bResponse\s*\.\s*json\s*\(/.test(source)) {
    trouves.push(`${chemin} construit une réponse JSON`)
  }
  if (/\bnew\s+Response\s*\(/.test(source)) {
    trouves.push(`${chemin} construit une réponse`)
  }
  if (
    !/export\s+const\s+(?:DELETE|GET|POST|PUT|PATCH)\s*=\s*adminJsonRoute\s*\(/.test(
      source
    )
  ) {
    trouves.push(`${chemin} n’exporte pas la valeur d’adminJsonRoute`)
  }

  return trouves
}

function contournements(sources: readonly SourceProduction[]): string[] {
  return ROUTES_SURVEILLEES.flatMap((chemin) => {
    const route = sources.find(({ chemin: nominee }) => nominee === chemin)
    return route === undefined
      ? [`${chemin} est absente du corpus`]
      : contournementsDe(route)
  })
}

function avecLignes(chemin: string, ...lignes: string[]): SourceProduction[] {
  const route = sourceDuCorpus(SOURCES, chemin)
  return avecSource(SOURCES, chemin, `${route.source}\n${lignes.join("\n")}\n`)
}

describe("Administration — frontière des routes JSON", () => {
  it("le parcours est non vacuant : il voit les deux routes et ne signale rien", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([...ROUTES_SURVEILLEES])
    )
    expect(contournements(SOURCES)).toEqual([])
  })
})

describe("Administration — la garde sait nommer le contournement", () => {
  it("signale une lecture de session replantée dans la route de libération", () => {
    const contournee = avecLignes(
      ROUTE_LIBERATION,
      'import { lireSession } from "@/lib/use-cases/session-courante"',
      "const client = await lireSession()"
    )

    expect(contournements(contournee)).toEqual([
      `${ROUTE_LIBERATION} importe la session courante`,
      `${ROUTE_LIBERATION} lit la session`,
    ])
  })

  it("signale un prédicat de rôle replanté dans la route de pré-signation", () => {
    const contournee = avecLignes(
      ROUTE_PRESIGNATION,
      'import { estAdmin } from "@/lib/use-cases/session-courante"',
      "const administrateur = estAdmin(client)"
    )

    expect(contournements(contournee)).toEqual([
      `${ROUTE_PRESIGNATION} importe la session courante`,
      `${ROUTE_PRESIGNATION} vérifie le rôle`,
    ])
  })

  it("signale une réponse construite dans la route de libération", () => {
    const contournee = avecLignes(
      ROUTE_LIBERATION,
      'return Response.json({ error: "Non autorisé" }, { status: 401 })'
    )

    expect(contournements(contournee)).toEqual([
      `${ROUTE_LIBERATION} construit une réponse JSON`,
    ])
  })

  it("signale une réponse nouvelle, pas seulement Response.json", () => {
    const contournee = avecLignes(
      ROUTE_PRESIGNATION,
      "return new Response(null, { status: 401 })"
    )

    expect(contournements(contournee)).toEqual([
      `${ROUTE_PRESIGNATION} construit une réponse`,
    ])
  })

  it("signale la route qui cesse d’importer la porte", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_LIBERATION)
    const sansPorte = route.source.replace(
      'import { adminJsonRoute } from "@/lib/use-cases/admin-json-route"\n',
      ""
    )
    expect(sansPorte).not.toBe(route.source)

    expect(
      contournements(avecSource(SOURCES, ROUTE_LIBERATION, sansPorte))
    ).toEqual([
      `${ROUTE_LIBERATION} n’importe pas adminJsonRoute depuis @/lib/use-cases/admin-json-route`,
    ])
  })

  it("signale la route qui n’exporte plus la valeur de la porte", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_LIBERATION)
    const sansExport = route.source.replace(
      "export const DELETE = adminJsonRoute(",
      "export const DELETE = (request: Request) => ("
    )
    expect(sansExport).not.toBe(route.source)

    expect(
      contournements(avecSource(SOURCES, ROUTE_LIBERATION, sansExport))
    ).toEqual([`${ROUTE_LIBERATION} n’exporte pas la valeur d’adminJsonRoute`])
  })
})
