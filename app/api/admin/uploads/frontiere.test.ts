import { describe, expect, it } from "vitest"

import {
  avecSource,
  carte,
  empruntsDeValeur,
  importeDe,
  sourceApres,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const ROUTE_LIBERATION = "app/api/admin/uploads/delete/route.ts"
const ROUTE_PRESIGNATION = "app/api/admin/uploads/presign/route.ts"

const ROUTES_SURVEILLEES = [ROUTE_LIBERATION, ROUTE_PRESIGNATION] as const

const PORTE = "lib/use-cases/admin-json-route"
const PORTE_SOURCE = "lib/use-cases/admin-json-route.ts"
const SESSION = "lib/use-cases/session-courante"

// ADR-0039 : la porte possède l'enveloppe HTTP, pas le stockage, le cycle de
// vie, la base, ni le catalogue.
const MODULES_INTERDITS_A_LA_PORTE = [
  ["lib/r2", "le stockage"],
  ["lib/cycle-vie-image-produit", "le cycle de vie"],
  ["lib/db", "la base de données"],
  ["lib/use-cases/admin-catalog", "le catalogue"],
] as const

const DECLARATION_STATUTS =
  /\bstatuses\s*:\s*STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT\b/

// Un import de valeur de next/server, même aliasé (`json as repondre`) : le
// motif s'arrête à la déclaration d'import suivante, donc un `import type` de
// `NextRequest` ne le déclenche pas.
const IMPORT_DE_VALEUR_DE_NEXT_SERVER =
  /\bimport\s+(?!type\b)(?:(?!\b(?:import|export)\b)[\s\S])*?\bfrom\s*(["'])next\/server\1/

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../..",
  "../../../../components",
  "../../../../lib"
)

function contournementsDe(
  { chemin, source }: SourceProduction,
  corpus: ReadonlyMap<string, SourceProduction>
): string[] {
  const trouves: string[] = []

  if (!importeDe(source, PORTE)) {
    trouves.push(
      `${chemin} n’importe pas adminJsonRoute depuis @/lib/use-cases/admin-json-route`
    )
  }
  // Seuls les emprunts de valeur comptent : un `import type { Client }` de la
  // session courante reste permis, il ne lit rien.
  if (
    empruntsDeValeur(chemin, source, corpus).some(
      ({ chemin: cible }) => cible === `${SESSION}.ts`
    )
  ) {
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
  if (/\bNextResponse\s*\.\s*json\s*\(/.test(source)) {
    trouves.push(`${chemin} construit une réponse JSON Next`)
  }
  if (/\bnew\s+NextResponse\s*\(/.test(source)) {
    trouves.push(`${chemin} construit une réponse Next`)
  }
  if (IMPORT_DE_VALEUR_DE_NEXT_SERVER.test(source)) {
    trouves.push(`${chemin} importe une valeur de next/server`)
  }
  if (!DECLARATION_STATUTS.test(source)) {
    trouves.push(
      `${chemin} ne déclare pas statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT`
    )
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
  const corpus = carte(sources)
  return ROUTES_SURVEILLEES.flatMap((chemin) => {
    const route = corpus.get(chemin)
    return route === undefined
      ? [`${chemin} est absente du corpus`]
      : contournementsDe(route, corpus)
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

  it("les deux routes déclarent la table de statuts du cycle de vie", () => {
    for (const chemin of ROUTES_SURVEILLEES) {
      expect(sourceDuCorpus(SOURCES, chemin).source, chemin).toMatch(
        DECLARATION_STATUTS
      )
    }
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

  it("ne confond pas un import de type avec un emprunt de valeur", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_LIBERATION)
    const intacte = avecSource(
      SOURCES,
      ROUTE_LIBERATION,
      `${sourceApres(
        route.source,
        'import type { Client } from "@/lib/use-cases/session-courante"'
      )}\nconst client: Client | null = null\nvoid client\n`
    )

    expect(contournements(intacte)).toEqual([])
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

  it("signale aussi le constructeur NextResponse, sous ses deux formes", () => {
    expect(
      contournements(
        avecLignes(
          ROUTE_PRESIGNATION,
          'return NextResponse.json({ error: "Non autorisé" }, { status: 401 })'
        )
      )
    ).toEqual([`${ROUTE_PRESIGNATION} construit une réponse JSON Next`])

    expect(
      contournements(
        avecLignes(
          ROUTE_LIBERATION,
          "return new NextResponse(null, { status: 401 })"
        )
      )
    ).toEqual([`${ROUTE_LIBERATION} construit une réponse Next`])
  })

  it("signale un import de valeur de next/server, fût-il aliasé", () => {
    const contournee = avecLignes(
      ROUTE_PRESIGNATION,
      'import { json as repondre } from "next/server"',
      'return repondre({ error: "Non autorisé" }, { status: 401 })'
    )

    expect(contournements(contournee)).toEqual([
      `${ROUTE_PRESIGNATION} importe une valeur de next/server`,
    ])
  })

  it("signale une route qui déclare une autre table de statuts", () => {
    const route = sourceDuCorpus(SOURCES, ROUTE_PRESIGNATION)
    const autreTable = route.source.replace(
      "statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,",
      'statuses: { "metadata-invalide": 400 },'
    )
    expect(autreTable).not.toBe(route.source)

    expect(
      contournements(avecSource(SOURCES, ROUTE_PRESIGNATION, autreTable))
    ).toEqual([
      `${ROUTE_PRESIGNATION} ne déclare pas statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT`,
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

describe("Administration — la porte n’apprend ni le stockage, ni le cycle de vie, ni la base, ni le catalogue", () => {
  it("n’importe aucun de ces quatre modules et n’emprunte que la session", () => {
    const porte = sourceDuCorpus(SOURCES, PORTE_SOURCE)
    const emprunts = empruntsDeValeur(
      porte.chemin,
      porte.source,
      carte(SOURCES)
    ).map(({ chemin }) => chemin)

    expect(emprunts).toContain(`${SESSION}.ts`)
    for (const [module, nom] of MODULES_INTERDITS_A_LA_PORTE) {
      expect(
        importeDe(porte.source, module, porte.chemin),
        `${PORTE_SOURCE} n’importe pas ${nom}`
      ).toBe(false)
    }
  })
})
