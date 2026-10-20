import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { artefactRegleCycleVieR2 } from "@/infra/regle-cycle-vie-r2"
import { retentionBrouillonImageProduitHeures } from "@/lib/cycle-vie-image-produit"
import {
  PREFIXE_BROUILLONS_IMAGE_PRODUIT,
  PREFIXE_IMAGES_PRODUIT,
} from "@/lib/espace-de-noms-image-produit"
import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  draftObjectKey,
  persistentObjectKey,
} from "@/lib/r2"

const CHEMIN_ARTEFACT = path.join(
  import.meta.dirname,
  "regle-cycle-vie-r2.json"
)

const PREFIXES_GLOBAUX = ["", "*", "/"] as const

function lireArtefact() {
  return JSON.parse(readFileSync(CHEMIN_ARTEFACT, "utf8")) as ReturnType<
    typeof artefactRegleCycleVieR2
  >
}

describe("règle de cycle de vie R2 des Brouillons d'Image produit", () => {
  it("décrit exactement l'artefact applicable, préfixe et rétention dérivés", () => {
    expect(lireArtefact()).toEqual(artefactRegleCycleVieR2())
  })

  it("porte une seule règle, un seul filtre de préfixe et une action d'expiration", () => {
    const artefact = lireArtefact()

    expect(artefact.rules).toHaveLength(1)
    const [regle, ...autres] = artefact.rules
    expect(autres).toEqual([])
    expect(regle.enabled).toBe(true)
    expect(regle.id).toBe("brouillons-image-produit")
    expect(regle.prefix).toBe(PREFIXE_BROUILLONS_IMAGE_PRODUIT)
    expect(regle.expire.days).toBe(
      Math.ceil(retentionBrouillonImageProduitHeures() / 24)
    )
  })

  it("n'a aucune règle globale sur le bucket", () => {
    const regles = lireArtefact().rules

    for (const regle of regles) {
      expect(PREFIXES_GLOBAUX as readonly string[]).not.toContain(regle.prefix)
      expect(regle.expire.days).toBeGreaterThan(0)
    }
    expect(regles.map((regle) => regle.prefix)).not.toContain(
      PREFIXE_IMAGES_PRODUIT
    )
  })

  it("atteint les objets du préfixe réservé et jamais une clé d'Image produit persistée", () => {
    const [regle] = lireArtefact().rules

    for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
      expect(draftObjectKey(randomUUID(), contentType)).toMatch(
        new RegExp(`^${regle.prefix}`)
      )
      for (let essai = 0; essai < 50; essai += 1) {
        const clePersistee = persistentObjectKey(randomUUID(), contentType)
        expect(clePersistee.startsWith(regle.prefix)).toBe(false)
        expect(clePersistee.startsWith(PREFIXE_IMAGES_PRODUIT)).toBe(true)
      }
    }
  })

  it("conserve le préfixe des brouillons strictement sous celui des images persistées", () => {
    expect(
      PREFIXE_BROUILLONS_IMAGE_PRODUIT.startsWith(PREFIXE_IMAGES_PRODUIT)
    ).toBe(true)
    expect(PREFIXE_BROUILLONS_IMAGE_PRODUIT.length).toBeGreaterThan(
      PREFIXE_IMAGES_PRODUIT.length
    )
  })
})
