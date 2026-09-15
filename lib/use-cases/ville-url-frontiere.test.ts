import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

/**
 * Frontière client/serveur du langage d'URL de la Ville.
 *
 * Le module `ville-url.ts` est partagé : la CityPicker (composant client)
 * l'importe pour écrire `?ville=`, `chargerDevis` (côté serveur) l'importe
 * pour résoudre la valeur — un import de `@/lib/db` y réintroduirait `pg`
 * (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack), comme documenté dans `devis-frontiere.test.ts`.
 *
 * Le motif d'import ancre la fin du nom de module (quote comprise) pour
 * ne pas confondre `@/lib/use-cases/livraison-prix` — le module pur qui
 * porte le type — avec `@/lib/use-cases/livraison`, qui tire la base.
 */
function lire(relatif: string): string {
  return readFileSync(new URL(relatif, import.meta.url), "utf8")
}

function importeDe(source: string, module: string): boolean {
  return new RegExp(
    `(?:import|export)[^;]*from\\s*["'][^"']*${module}["']`
  ).test(source)
}

describe("Langage d'URL de la Ville — frontière client/serveur", () => {
  it("le module est neutre : ni use client, ni crochet, ni accès base", () => {
    const source = lire("./ville-url.ts")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/useState/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le type de Ville vient du module pur, jamais de l'entrée base", () => {
    const source = lire("./ville-url.ts")
    expect(importeDe(source, "livraison-prix")).toBe(true)
    expect(source).not.toMatch(/from\s*["'][^"']*\/livraison["']/)
  })
})
