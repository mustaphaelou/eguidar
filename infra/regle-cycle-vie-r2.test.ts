import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { artefactRegleCycleVieR2 } from "@/infra/regle-cycle-vie-r2"
import { retentionBrouillonImageProduitHeures } from "@/lib/cycle-vie-image-produit"
import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  DRAFT_PRODUCTS_PREFIX,
  PRODUCTS_PREFIX,
  draftObjectKey,
  persistentObjectKey,
} from "@/lib/r2"

const CHEMIN_ARTEFACT = path.join(
  import.meta.dirname,
  "regle-cycle-vie-r2.json"
)

/** Préfixes d'une règle « globale » : ils expirent tout le bucket. */
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

    // Pas de pin sur la valeur du bucket : la source de vérité est
    // `R2_BUCKET` (module `infra/regle-cycle-vie-r2.ts`), et la réconciliation
    // « artefact versionné == bucket de l'application » est l'arrêt auquel se
    // broche `scripts/setup-providers.sh` avant d'écrire. Épingler "eguidar"
    // ici rendait vert impossible dès que le bucket n'était pas le par défaut.
    expect(artefact.rules).toHaveLength(1)
    const [regle, ...autres] = artefact.rules
    expect(autres).toEqual([])
    expect(regle.enabled).toBe(true)
    expect(regle.id).toBe("brouillons-image-produit")
    expect(regle.prefix).toBe(DRAFT_PRODUCTS_PREFIX)
    // La rétention configurée n'est pas la valeur initiale : l'invariant qui
    // compte — la règle n'expire jamais un Brouillon encore revendicable — est
    // vérifié sur un éventail de valeurs dans
    // `lib/cycle-vie-image-produit-retention.test.ts`.
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
    expect(regles.map((regle) => regle.prefix)).not.toContain(PRODUCTS_PREFIX)
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
        expect(clePersistee.startsWith(PRODUCTS_PREFIX)).toBe(true)
      }
    }
  })

  it("conserve le préfixe des brouillons strictement sous celui des images persistées", () => {
    expect(DRAFT_PRODUCTS_PREFIX.startsWith(PRODUCTS_PREFIX)).toBe(true)
    expect(DRAFT_PRODUCTS_PREFIX.length).toBeGreaterThan(PRODUCTS_PREFIX.length)
  })
})
