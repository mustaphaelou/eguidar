import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { HOTE_EDGE } from "@/lib/zone-edge"

import { TETES_RSC, artefactRegleCacheEdge } from "@/infra/regle-cache-edge"

const CHEMIN_ARTEFACT = path.join(import.meta.dirname, "regle-cache-edge.json")

const CHEMIN_DERIVATION = path.join(import.meta.dirname, "regle-cache-edge.ts")

function lireArtefact() {
  return JSON.parse(readFileSync(CHEMIN_ARTEFACT, "utf8")) as ReturnType<
    typeof artefactRegleCacheEdge
  >
}

function presence(tete: string): string {
  return `any(lower(http.request.headers.names[*])[*] eq "${tete}")`
}

describe("règle de cache de la zone edge", () => {
  it("décrit exactement l'artefact applicable, expressions dérivées", () => {
    expect(lireArtefact()).toEqual(artefactRegleCacheEdge())
  })

  it("porte deux règles ordonnées, le contournement avant l'éligibilité", () => {
    const [contournement, documents, ...autres] = lireArtefact().rules

    expect(autres).toEqual([])
    expect(contournement.ref).toBe("rsc-et-prefetch-hors-cache")
    expect(contournement.action_parameters.cache).toBe(false)
    expect(documents.ref).toBe("documents-anonymes-eguidar")
    expect(documents.action_parameters.cache).toBe(true)
  })

  it("ne contourne que les deux têtes nommées par la spécification", () => {
    expect(TETES_RSC).toEqual(["rsc", "next-router-prefetch"])

    const citees = lireArtefact()
      .rules.flatMap((regle) => [
        ...regle.expression.matchAll(
          /headers\.names\[\*\]\)\[\*\] eq "([^"]+)"/g
        ),
      ])
      .map((trouve) => trouve[1])

    expect(new Set(citees)).toEqual(new Set(TETES_RSC))
  })

  it("garde le contournement RSC dans l'expression de l'éligibilité, pas seulement dans la première règle", () => {
    const [contournement, documents] = lireArtefact().rules

    for (const tete of TETES_RSC) {
      expect(contournement.expression).toContain(presence(tete))
      expect(documents.expression).toContain(`not ${presence(tete)}`)
    }
  })

  it("n'ajoute aucune règle pour /_next/image et exclut l'API et les actifs Next", () => {
    const [contournement, documents] = lireArtefact().rules

    expect(JSON.stringify(lireArtefact())).not.toContain("_next/image")
    expect(contournement.expression).not.toContain("_next/image")
    expect(documents.expression).toContain(
      `not starts_with(http.request.uri.path, "/api/")`
    )
    expect(documents.expression).toContain(
      `not starts_with(http.request.uri.path, "/_next/")`
    )
  })

  it("exclut le repli d'un Catalogue vide sur les trois routes dynamiques", () => {
    const documents = lireArtefact().rules[1]

    expect(documents.expression).toContain(
      `not ends_with(http.request.uri.path, "/__placeholder__")`
    )
    // Une négation de suffixe couvre /produit, /categorie et /blog sans
    // énumérer les trois chemins.
    expect(documents.expression.match(/__placeholder__/g)).toHaveLength(1)
  })

  it("honore l'origine et échoue fermée quand elle n'envoie pas de Cache-Control", () => {
    const artefact = lireArtefact()
    const serialise = JSON.stringify(artefact)

    expect(artefact.rules[1].action_parameters.edge_ttl).toEqual({
      mode: "bypass_by_default",
    })
    expect(serialise).not.toMatch(/override_origin|status_code_ttl/)
    expect(serialise).not.toContain("cache_key")
    expect(serialise).not.toContain("vary")
  })

  it("ne conditionne pas la règle éligible à la méthode, pour que la purge par URL la retrouve", () => {
    expect(lireArtefact().rules[1].expression).not.toContain(
      "http.request.method"
    )
  })

  it("ne nomme qu'un hôte, celui de la zone dérivé du site", () => {
    const artefact = lireArtefact()

    expect(artefact.zone).toBe(HOTE_EDGE)
    const hotes = artefact.rules
      .flatMap((regle) => [
        ...regle.expression.matchAll(/http\.host eq "([^"]+)"/g),
      ])
      .map((trouve) => trouve[1])
    expect(hotes).toEqual([HOTE_EDGE])
    expect(readFileSync(CHEMIN_DERIVATION, "utf8")).not.toContain("eguidar.com")
  })
})
