import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

/**
 * Frontière client/serveur du Devis.
 *
 * Régression de la panne /panier « This page couldn't load » : l'entrée
 * serveur (`devis.ts`, via `chargerDevis`) et la page serveur du Panier
 * appelaient `selectionnerDevis` / `lignesDevis` importées depuis le module
 * client `devis-selection.ts` (« use client »). Appeler une fonction cliente
 * depuis le serveur lève en production (« Attempted to call
 * selectionnerDevis() from the server… ») — vitest, lui, ignore la
 * directive et reste vert, donc seule une garde sur le graphe d'imports
 * verrouille le bug.
 *
 * Règle : le pur partagé vit dans `devis-coeur.ts` (neutre, sans
 * directive), consommé des deux côtés ; `devis-selection.ts` ne porte que
 * le crochet client ; aucun module serveur n'importe `devis-selection`.
 */
function lire(relatif: string): string {
  return readFileSync(new URL(relatif, import.meta.url), "utf8")
}

function importeDe(source: string, module: string): boolean {
  return new RegExp(
    `(?:import|export)[^;]*from\\s*["'][^"']*${module}["']`
  ).test(source)
}

const SERVEUR_SANS_CLIENT = [
  "./devis.ts",
  "./orders.ts",
  "../../app/(boutique)/panier/page.tsx",
  "../../app/(boutique)/checkout/page.tsx",
]

describe("Devis — frontière client/serveur", () => {
  it("aucun module serveur n'importe le module client devis-selection", () => {
    for (const fichier of SERVEUR_SANS_CLIENT) {
      expect(importeDe(lire(fichier), "devis-selection"), fichier).toBe(false)
    }
  })

  it("le cœur pur est neutre : ni use client, ni crochet, ni accès base", () => {
    const coeur = lire("./devis-coeur.ts")
    expect(coeur).not.toMatch(/^"use client"/m)
    expect(coeur).not.toMatch(/useState/)
    expect(importeDe(coeur, "lib/db")).toBe(false)
  })

  it("l'entrée cliente garde use client et réexporte le pur depuis le cœur", () => {
    const selection = lire("./devis-selection.ts")
    expect(selection).toMatch(/^"use client"/m)
    expect(importeDe(selection, "devis-coeur")).toBe(true)
    expect(importeDe(selection, "lib/db")).toBe(false)
  })
})
