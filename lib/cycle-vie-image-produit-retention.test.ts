import { afterAll, afterEach, describe, expect, it } from "vitest"

import { artefactRegleCycleVieR2 } from "@/infra/regle-cycle-vie-r2"
import {
  RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT,
  retentionBrouillonImageProduitHeures,
} from "@/lib/cycle-vie-image-produit"
import { DUREE_VIE_URL_ENVOI_PRESIGNEE_S } from "@/lib/r2"

const HEURES_PAR_JOUR = 24
const CLE_RETENTION = "RETENTION_BROUILLON_IMAGE_PRODUIT_H"

/**
 * Une rétention configurée, puis la rétention effective que l'application en
 * déduit. `undefined`unset, les autres cas couvrent le repli sur la valeur
 * initiale et une configuration normale.
 */
const RETENTIONS_CONFIGUREES = [
  {
    configuree: undefined,
    effective: RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT,
  },
  { configuree: "1", effective: 1 },
  { configuree: "24", effective: 24 },
  { configuree: "25", effective: 25 },
  { configuree: "72", effective: 72 },
  { configuree: "168", effective: 168 },
  {
    configuree: "0",
    effective: RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT,
  },
  {
    configuree: "beaucoup",
    effective: RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT,
  },
] as const

const valeurInitiale = process.env[CLE_RETENTION]

function configurerRetention(valeur: string | undefined): void {
  if (valeur === undefined) delete process.env[CLE_RETENTION]
  else process.env[CLE_RETENTION] = valeur
}

function joursDeLaRegle(): number {
  const [regle, ...autres] = artefactRegleCycleVieR2().rules
  if (autres.length > 0) throw new Error("La règle R2 doit rester unique")
  return regle.expire.days
}

describe("rétention d'un Brouillon d'Image produit", () => {
  afterEach(() => configurerRetention(valeurInitiale))

  afterAll(() => configurerRetention(valeurInitiale))

  it("est lue en un seul endroit, l'environnement", () => {
    for (const { configuree, effective } of RETENTIONS_CONFIGUREES) {
      configurerRetention(configuree)
      expect(retentionBrouillonImageProduitHeures(), configuree).toBe(effective)
    }
  })

  it("porte dans la règle R2 la rétention configurée, jamais la valeur initiale", () => {
    // La règle de cycle de vie R2 est le seul mécanisme d'expiration hors
    // bande : si elle expiré plus tôt que la rétention que l'application
    // applique, la promotion d'un Brouillon encore revendicable échouerait et
    // l'enregistrement de l'éditeur cass.
    for (const { configuree, effective } of RETENTIONS_CONFIGUREES) {
      configurerRetention(configuree)
      const jours = joursDeLaRegle()

      // R2 n'exprime l'expiration qu'en jours entiers : on arrondit au jour
      // supérieur, sinon la règle supprimerait un fichier que l'application
      // considère encore revendicable.
      expect(jours * HEURES_PAR_JOUR, configuree).toBeGreaterThanOrEqual(
        effective
      )
      expect(jours, configuree).toBe(
        Math.max(1, Math.ceil(effective / HEURES_PAR_JOUR))
      )
    }
  })

  it("reste strictement plus longue que la durée de vie d'une URL d'envoi", () => {
    // La raison d'être de la rétention : réessayer un enregistrement échoué sans
    // téléverser à nouveau l'image. Elle tient donc tant qu'elle survit à la
    // seule URL d'envoi que l'éditeur a.
    for (const { configuree, effective } of RETENTIONS_CONFIGUREES) {
      expect(effective * 60 * 60, configuree).toBeGreaterThan(
        DUREE_VIE_URL_ENVOI_PRESIGNEE_S
      )
    }
  })
})
