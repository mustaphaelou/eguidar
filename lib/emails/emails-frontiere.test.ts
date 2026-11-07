import { existsSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const ADAPTATEUR = "lib/emails/adaptateur-envoi.ts"

const MODULES_INTERDITS = [
  "next",
  "react",
  "react-dom",
  "@prisma/client",
  "@/lib/generated/prisma",
  "@/lib/db",
  "server-only",
  "resend",
  "@/lib/email",
] as const

const MODULES_STRUCTURELS = [
  "next",
  "react",
  "react-dom",
  "@prisma/client",
  "@/lib/generated/prisma",
  "@/lib/db",
  "server-only",
] as const

function violationsNeutralite(source: SourceProduction): string[] {
  if (source.chemin === ADAPTATEUR) return []
  return MODULES_INTERDITS.filter((module) =>
    importeDe(source.source, module)
  ).map((module) => `${source.chemin} importe ${module}`)
}

const sources = sourcesDeProduction(import.meta.url, ".")

describe("Couche e-mail — frontière de neutralité", () => {
  it("couvre tous les modules de production de la couche", () => {
    expect(sources.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "lib/emails/adaptateur-envoi.ts",
        "lib/emails/duree-code.ts",
        "lib/emails/etapes.ts",
        "lib/emails/exemples.ts",
        "lib/emails/gabarit.ts",
        "lib/emails/html.ts",
        "lib/emails/index.ts",
        "lib/emails/lettre-code.ts",
        "lib/emails/lettres-commande.ts",
        "lib/emails/marque.ts",
        "lib/emails/message.ts",
        "lib/emails/pied.ts",
      ])
    )
  })

  it("aucun module, hors adaptateur, n'importe Next, React, Prisma, server-only ni le fournisseur", () => {
    expect(sources.flatMap(violationsNeutralite)).toEqual([])
  })

  it("l'adaptateur est le seul à connaître le fournisseur", () => {
    const adaptateur = sources.find(({ chemin }) => chemin === ADAPTATEUR)
    expect(adaptateur).toBeDefined()
    expect(importeDe(adaptateur!.source, "@/lib/email")).toBe(true)

    const autres = sources.filter(({ chemin }) => chemin !== ADAPTATEUR)
    expect(
      autres.filter(({ source }) => importeDe(source, "@/lib/email"))
    ).toEqual([])
    expect(
      MODULES_STRUCTURELS.filter((module) =>
        importeDe(adaptateur!.source, module)
      )
    ).toEqual([])
  })

  it("le chemin public de la couche est le répertoire, plus le fichier", () => {
    expect(existsSync(new URL("../emails.ts", import.meta.url))).toBe(false)
    expect(existsSync(new URL("./index.ts", import.meta.url))).toBe(true)
  })

  it("tombe sur une violation synthétique", () => {
    const factice: SourceProduction = {
      chemin: "lib/emails/factice.ts",
      source: 'import { db } from "@/lib/db"\n',
    }

    expect(violationsNeutralite(factice)).toEqual([
      "lib/emails/factice.ts importe @/lib/db",
    ])
  })
})
