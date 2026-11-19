import { describe, expect, it } from "vitest"

import {
  atteignables,
  avecSource,
  directive,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULES = [
  "lib/admin-listing.ts",
  "lib/commande-listing.ts",
  "lib/produit-listing.ts",
] as const

const NEUTRE = "lib/admin-listing.ts"
const ENTITES = ["lib/commande-listing.ts", "lib/produit-listing.ts"] as const

const INTERDITS = [
  "next",
  "react",
  "react-dom",
  "@tanstack/react-table",
  "@prisma/client",
  "lib/db",
  "lib/generated/prisma/client",
  "server-only",
] as const

const CHEMINS_INTERDITS = [
  "lib/db.ts",
  "lib/generated/prisma/client.ts",
] as const

const SOURCES = sourcesDeProduction(import.meta.url, "../lib")
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source absente du corpus : ${chemin}`)
  return trouvee
}

describe("Langage d'URL d'Administration — frontière Loi 3", () => {
  it("les trois modules neutres sont présents et le module commun n'importe rien", () => {
    for (const chemin of MODULES) {
      expect(PAR_CHEMIN.has(chemin), chemin).toBe(true)
    }

    const source = sourceDe(NEUTRE).source
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
  })

  it("aucun des trois modules n'importe Next, React, Prisma, la base ou TanStack", () => {
    for (const chemin of MODULES) {
      const source = sourceDe(chemin).source
      expect(directive(source), chemin).toBeNull()
      expect(source, chemin).not.toMatch(/\buse[A-Z]\w*\(/)
      for (const interdit of INTERDITS) {
        expect(importeDe(source, interdit), `${chemin} → ${interdit}`).toBe(
          false
        )
      }
    }
  })

  it("les deux modules d'entité partagent le module neutre", () => {
    for (const chemin of ENTITES) {
      expect(importeDe(sourceDe(chemin).source, "admin-listing"), chemin).toBe(
        true
      )
    }
  })

  it("le graphe de valeurs des trois modules n'atteint ni la base ni Prisma", () => {
    for (const chemin of MODULES) {
      const atteints = atteignables(chemin, PAR_CHEMIN)
      expect(atteints.has(chemin), chemin).toBe(true)
      for (const interdit of CHEMINS_INTERDITS) {
        expect(atteints.has(interdit), `${chemin} → ${interdit}`).toBe(false)
      }
      for (const atteint of atteints) {
        expect(directive(sourceDe(atteint).source), atteint).toBeNull()
      }
    }
  })

  it("la garde tombe sur une violation synthétique", () => {
    const violation = [
      '"use client"',
      'import { useState } from "react"',
      'import { createPortal } from "react-dom"',
      'import { useTable } from "@tanstack/react-table"',
      'import { headers } from "next/headers"',
      'import "server-only"',
      'import { PrismaClient } from "@prisma/client"',
      'import { prisma } from "@/lib/db"',
      'import type { OrderStatus } from "@/lib/generated/prisma/client"',
      "",
    ].join("\n")

    expect(directive(violation)).toBe("use client")
    for (const interdit of INTERDITS) {
      expect(importeDe(violation, interdit), interdit).toBe(true)
    }

    const corrompus = avecSource(SOURCES, NEUTRE, violation)
    const graphe = atteignables(
      NEUTRE,
      new Map(corrompus.map((source) => [source.chemin, source]))
    )
    expect(graphe.has("lib/db.ts")).toBe(true)
  })
})
