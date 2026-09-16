import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur de la Carte produit.
 *
 * `carte-produit.ts` est partagé des deux côtés de la couture : les
 * composants clients qui rendent une Carte produit l'importeront (Produit
 * lié, suggestions de Recherche), et les modules de lecture serveur
 * l'importent déjà (`@/lib/use-cases/blog`). Un import de `@/lib/db` y
 * réintroduirait `pg` (`require('dns')`) dans le bundle navigateur et
 * casserait `next build` (Turbopack) — la panne documentée dans
 * `devis-frontiere.test.ts` et `ville-url-frontiere.test.ts`. La directive
 * `"use client"`, un crochet, `next/headers` ou `server-only` le
 * rendraient de même inutilisable d'un des deux côtés.
 *
 * Second verrou : le module reste le propriétaire unique de la projection
 * — la lecture serveur du Produit lié passe par lui au lieu de
 * réassembler les huit faits (première image comprise) sur place.
 */
describe("Carte produit — frontière client/serveur", () => {
  it("le module est neutre : ni use client, ni crochet, ni base", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/useState/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le module n'importe ni next/headers ni server-only", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })

  it("la lecture serveur du Produit lié projette par le module neutre", () => {
    const blog = lire(import.meta.url, "./use-cases/blog.ts")
    expect(importeDe(blog, "carte-produit")).toBe(true)
    expect(blog).not.toMatch(/image:\s*images\[0\]/)
  })
})
