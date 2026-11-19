import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const NEUTRE = "./admin-listing.ts"
const ENTITES = ["./commande-listing.ts", "./produit-listing.ts"]
const INTERDITS = [
  "react",
  "next/navigation",
  "next/headers",
  "@tanstack/react-table",
  "lib/db",
  "@prisma/client",
  "server-only",
]

describe("Listing grammar — frontière client/serveur", () => {
  it("le module neutre n'importe rien : sa neutralité est inconditionnelle", () => {
    const source = lire(import.meta.url, NEUTRE)
    expect(source).not.toMatch(/^"use (?:client|server)"/m)
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    for (const cheminModule of INTERDITS) {
      expect(importeDe(source, cheminModule)).toBe(false)
    }
  })

  it("les modules d'entité restent neutres de tout framework et de toute base", () => {
    for (const cheminModule of ENTITES) {
      const source = lire(import.meta.url, cheminModule)
      expect(source).not.toMatch(/^"use (?:client|server)"/m)
      for (const interdit of INTERDITS) {
        expect(importeDe(source, interdit)).toBe(false)
      }
    }
  })

  it("les deux modules d'entité reposent sur le même module neutre", () => {
    for (const cheminModule of ENTITES) {
      const source = lire(import.meta.url, cheminModule)
      expect(importeDe(source, "admin-listing")).toBe(true)
    }
  })

  it("la garde tombe sur une violation synthétique", () => {
    const violation = [
      '"use client"',
      'import { useState } from "react"',
      'import { useRouter } from "next/navigation"',
      'import { prisma } from "@/lib/db"',
      'import { useTable } from "@tanstack/react-table"',
    ].join("\n")

    expect(violation).toMatch(/^"use (?:client|server)"/m)
    expect(importeDe(violation, "react")).toBe(true)
    expect(importeDe(violation, "next/navigation")).toBe(true)
    expect(importeDe(violation, "lib/db")).toBe(true)
    expect(importeDe(violation, "@tanstack/react-table")).toBe(true)
  })

  it("les modules sont bien dans le corpus de production", () => {
    const sources = sourcesDeProduction(import.meta.url, "../lib")
    expect(sources.length).toBeGreaterThan(100)
    for (const cheminModule of [NEUTRE, ...ENTITES]) {
      expect(
        sources.some(({ chemin }) => chemin.endsWith(cheminModule.slice(2)))
      ).toBe(true)
    }
  })
})
