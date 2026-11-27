import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { AnnonceActive } from "@/lib/use-cases/storefront"

import { RubanAnnonce } from "./ruban-annonce"

async function rendreLeRuban(annonce: AnnonceActive | null): Promise<string> {
  const flux = await renderToReadableStream(<RubanAnnonce annonce={annonce} />)
  await flux.allReady
  return new Response(flux).text()
}

describe("RubanAnnonce", () => {
  it("ne rend rien quand l'Annonce est absente", async () => {
    const html = await rendreLeRuban(null)

    expect(html).toBe("")
  })

  it("rend un repère region nommé Annonce avec le message seul et sans bouton de fermeture", async () => {
    const html = await rendreLeRuban({
      message: "Livraison offerte dès 500 DH",
      lienUrl: null,
      lienLibelle: null,
    })

    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Annonce"')
    expect(html).toContain("Livraison offerte dès 500 DH")
    expect(html).not.toContain("<a ")
    expect(html).not.toContain("<button")
  })

  it("rend le lien interne quand l'URL et le libellé sont tous deux présents", async () => {
    const html = await rendreLeRuban({
      message: "Nouvelle collection disponible",
      lienUrl: "/produits",
      lienLibelle: "Découvrir",
    })

    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Annonce"')
    expect(html).toContain("Nouvelle collection disponible")
    expect(html).toContain('href="/produits"')
    expect(html).toContain("Découvrir</a>")
  })

  it("n'affiche pas de lien quand seul l'URL ou seul le libellé est fourni", async () => {
    const sansLibelle = await rendreLeRuban({
      message: "Offre de la semaine",
      lienUrl: "/produits",
      lienLibelle: null,
    })
    const sansUrl = await rendreLeRuban({
      message: "Offre de la semaine",
      lienUrl: null,
      lienLibelle: "Découvrir",
    })

    expect(sansLibelle).toContain("Offre de la semaine")
    expect(sansLibelle).not.toContain("<a ")
    expect(sansUrl).toContain("Offre de la semaine")
    expect(sansUrl).not.toContain("<a ")
  })

  it("reste un composant serveur pur sans directive client", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "ruban-annonce.tsx"),
      "utf8"
    )

    expect(source).not.toContain('"use client"')
    expect(source).not.toContain("'use client'")
  })
})
