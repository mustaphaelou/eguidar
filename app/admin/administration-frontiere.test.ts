import { describe, expect, it } from "vitest"

import {
  avecSource,
  directive,
  importeDe,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const SOURCES_ADMINISTRATION = sourcesDeProduction(
  import.meta.url,
  "../../app/admin",
  "../../components/admin"
)

const CONFIRM_NATIF = /\b(?:window\.)?confirm\s*\(/

const SURFACES_IMPORT = [
  "app/admin/produits/importer/page.tsx",
  "app/admin/produits/importer/actions.ts",
  "app/admin/produits/importer/formulaire-import.tsx",
  "app/admin/produits/importer/panneau-lot-import.tsx",
] as const

describe("l'Administration ne demande plus confirmation au navigateur", () => {
  it("aucune source de l'Administration n'appelle le confirm() natif", () => {
    const appels = SOURCES_ADMINISTRATION.filter(({ source }) =>
      CONFIRM_NATIF.test(source)
    ).map(({ chemin }) => chemin)

    expect(appels).toEqual([])
  })
})

describe("l'import des Produits passe par la porte de l'Administration", () => {
  it("le parcours est non vacuant : il voit la page, l'action et les composants", () => {
    expect(SOURCES_ADMINISTRATION.length).toBeGreaterThan(25)
    expect(SOURCES_ADMINISTRATION.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([...SURFACES_IMPORT])
    )
  })

  it("aucune surface de l'import n'importe la base de données", () => {
    for (const chemin of SURFACES_IMPORT) {
      const { source } = sourceDuCorpus(SOURCES_ADMINISTRATION, chemin)
      expect(importeDe(source, "lib/db"), chemin).toBe(false)
    }
  })

  it("l'action est une action serveur déclarée par adminFormAction", () => {
    const action = sourceDuCorpus(
      SOURCES_ADMINISTRATION,
      "app/admin/produits/importer/actions.ts"
    )

    expect(directive(action.source)).toBe("use server")
    expect(action.source).toContain("adminFormAction")
  })

  it("la page vit sous la porte du layout, qui lit la Session et vérifie le rôle", () => {
    expect(SURFACES_IMPORT[0].startsWith("app/admin/")).toBe(true)
    const layout = sourceDuCorpus(
      SOURCES_ADMINISTRATION,
      "app/admin/layout.tsx"
    ).source

    expect(layout).toContain("lireSession")
    expect(layout).toContain("estAdmin")
    expect(layout).toContain("redirect")
  })
})

const MODULE_GARDE = "lib/use-cases/exiger-admin"
const PAGES_ADMIN = SOURCES_ADMINISTRATION.filter(({ chemin }) =>
  /^app\/admin\/(?:.*\/)?page\.tsx$/.test(chemin)
)

const APPEL_GARDE = /\bawait\s+exigerAdmin\s*\(/
const LECTURE = /\bawait\s+[A-Za-z_$][\w$]*\s*\(/

function manquementsDe({ chemin, source }: SourceProduction): string[] {
  const trouves: string[] = []

  if (!importeDe(source, MODULE_GARDE, chemin)) {
    trouves.push(`${chemin} n'importe pas exigerAdmin`)
  }

  const garde = source.match(APPEL_GARDE)
  if (!garde) {
    trouves.push(`${chemin} n'appelle pas exigerAdmin()`)
    return trouves
  }

  const lecture = source.match(LECTURE)
  if (
    lecture?.index !== undefined &&
    garde.index !== undefined &&
    garde.index > lecture.index
  ) {
    trouves.push(`${chemin} lit des données avant exigerAdmin()`)
  }

  return trouves
}

function manquements(sources: readonly SourceProduction[]): string[] {
  return sources.flatMap(manquementsDe)
}

describe("Administration — chaque page refuse avant de lire", () => {
  it("le parcours est non vacuant : il voit les pages de liste et de détail", () => {
    expect(PAGES_ADMIN.length).toBeGreaterThanOrEqual(19)
    const chemins = PAGES_ADMIN.map(({ chemin }) => chemin)
    for (const chemin of [
      "app/admin/page.tsx",
      "app/admin/commandes/page.tsx",
      "app/admin/commandes/[orderId]/page.tsx",
      "app/admin/produits/page.tsx",
      "app/admin/produits/[id]/page.tsx",
    ]) {
      expect(chemins, chemin).toContain(chemin)
    }
  })

  it("toutes les pages appellent exigerAdmin avant leur première lecture", () => {
    expect(manquements(PAGES_ADMIN)).toEqual([])
  })
})

describe("Administration — la frontière nomme la page sans garde", () => {
  it("signale une page existante dont on retire l'appel", () => {
    const chemin = "app/admin/commandes/page.tsx"
    const page = sourceDuCorpus(PAGES_ADMIN, chemin)
    const sansGarde = page.source.replace("  await exigerAdmin()\n", "")
    expect(sansGarde).not.toBe(page.source)

    expect(manquements(avecSource(PAGES_ADMIN, chemin, sansGarde))).toEqual([
      `${chemin} n'appelle pas exigerAdmin()`,
    ])
  })

  it("signale une page future qui n'importe ni n'appelle la garde", () => {
    const future: SourceProduction = {
      chemin: "app/admin/futur/page.tsx",
      source: "export default async function P() { return await lireTruc() }\n",
    }

    expect(manquements([future])).toEqual([
      "app/admin/futur/page.tsx n'importe pas exigerAdmin",
      "app/admin/futur/page.tsx n'appelle pas exigerAdmin()",
    ])
  })

  it("signale une page future qui lit avant d'appeler la garde", () => {
    const future: SourceProduction = {
      chemin: "app/admin/futur/page.tsx",
      source: `import { exigerAdmin } from "@/lib/use-cases/exiger-admin"\nexport default async function P() { const x = await lireTruc(); await exigerAdmin(); return x }\n`,
    }

    expect(manquements([future])).toEqual([
      "app/admin/futur/page.tsx lit des données avant exigerAdmin()",
    ])
  })
})
