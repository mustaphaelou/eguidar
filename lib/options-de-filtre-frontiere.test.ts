import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur de l'Option de filtre.
 *
 * `lib/options-de-filtre.ts` est partagé des deux côtés de la couture : le
 * serveur l'appelle à côté des requêtes de facettes (`lib/use-cases/search.ts`)
 * et la barre latérale cliente ne rend plus que la liste reçue
 * (`components/storefront/search-filters.tsx`). Un import de `@/lib/db` y
 * réintroduirait `pg` (`require('dns')`) dans le bundle navigateur et
 * casserait `next build` (Turbopack) — la panne documentée dans
 * `devis-frontiere.test.ts` et `carte-produit-frontiere.test.ts` ; la
 * directive `"use client"`, un crochet ou `next/headers` le rendraient de
 * même inutilisable d'un des deux côtés.
 *
 * Premier verrou : le module est neutre — aucune directive, aucun crochet,
 * aucun accès base, en-têtes ou moteur. Il ne parle pas au Moteur de
 * recherche : il reçoit des répartitions déjà comptées, jamais une requête.
 *
 * Deuxième verrou : la barre latérale atteint les options par ce module et
 * ne reconstruit plus rien — ni l'univers des bandes de prix, ni un tri,
 * ni un décompte.
 *
 * Troisième verrou : aucune surface de `components/` qui atteint les
 * options n'atteint la base — parcours de toute l'arborescence, pas une
 * liste de noms.
 */
describe("Option de filtre — frontière client/serveur", () => {
  it("le module est neutre : ni use client, ni crochet, ni base, ni moteur", () => {
    const source = lire(import.meta.url, "./options-de-filtre.ts")

    // La garde vise un module qui porte encore l'assemblage : un fichier
    // vidé passerait sinon pour neutre.
    expect(source).toContain("assemblerOptionsDeFiltre")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    for (const interdit of [
      "lib/db",
      "next/headers",
      "server-only",
      "lib/meili",
      "meilisearch",
      "moteur-recherche",
    ]) {
      expect(importeDe(source, interdit), interdit).toBe(false)
    }
  })

  it("la barre latérale atteint les options par le module neutre", () => {
    const barre = lire(
      import.meta.url,
      "../components/storefront/search-filters.tsx"
    )

    expect(importeDe(barre, "options-de-filtre")).toBe(true)
    // La reconstruction cliente est supprimée, pas adaptée : l'univers des
    // bandes, le tri et la résolution des libellés n'ont plus lieu d'être
    // côté navigateur, et `search-filters` ne doit pas non plus atteindre
    // le module serveur de la Recherche.
    expect(importeDe(barre, "price-buckets")).toBe(false)
    expect(importeDe(barre, "use-cases/search")).toBe(false)
  })

  it("aucune surface qui rend les options n'atteint la base", () => {
    const sources = sourcesDeProduction(import.meta.url, "../components")
    // Parcours non vacuant : chaque source de `components/` est visitée.
    expect(sources.length).toBeGreaterThan(50)

    const rendeurs = sources.filter(({ source }) =>
      importeDe(source, "options-de-filtre")
    )
    expect(rendeurs.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining(["components/storefront/search-filters.tsx"])
    )
    for (const { chemin, source } of rendeurs) {
      expect(importeDe(source, "lib/db"), chemin).toBe(false)
    }
  })
})
