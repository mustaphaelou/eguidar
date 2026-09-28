import {
  creerCycleVieImageProduit,
  RevendicationImagesProduit,
  type BrouillonImageProduit,
  type CodeRefusRegistreBrouillon,
  type EntreeCreationBrouillonImageProduit,
  type PortRegistreBrouillonImageProduit,
  type ResultatRevendicationRegistre,
} from "@/lib/cycle-vie-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type {
  CodeEchecStockage,
  PortStockageImageProduit,
  ValeurPromotionBrouillon,
  ValeurPresignBrouillon,
} from "@/lib/r2"

export interface StockageImageProduitMemoire extends PortStockageImageProduit {
  readonly presignatures: Array<{
    draftId: string
    contentType: string
    size: number
  }>
  readonly promotions: Array<{ draftId: string; publicUrl: string }>
  readonly suppressionsBrouillons: string[]
  readonly suppressionsImagesPromues: string[]
  readonly suppressionsImagesPersistees: string[]
  readonly suppressionsImagesCategorie: string[]
  failPresign: boolean
  failPromotion: boolean
  failDelete: boolean
}

function echec(
  code: CodeEchecStockage,
  message: string
): { ok: false; erreur: { code: CodeEchecStockage; message: string } } {
  return { ok: false, erreur: { code, message } }
}

export function creerStockageImageProduitMemoire(): StockageImageProduitMemoire {
  const presignatures: StockageImageProduitMemoire["presignatures"] = []
  const promotions: Array<{ draftId: string; publicUrl: string }> = []
  const suppressionsBrouillons: string[] = []
  const suppressionsImagesPromues: string[] = []
  const suppressionsImagesPersistees: string[] = []
  const suppressionsImagesCategorie: string[] = []

  const stockage: StockageImageProduitMemoire = {
    presignatures,
    promotions,
    suppressionsBrouillons,
    suppressionsImagesPromues,
    suppressionsImagesPersistees,
    suppressionsImagesCategorie,
    failPresign: false,
    failPromotion: false,
    failDelete: false,

    async presignerBrouillon(input) {
      presignatures.push(input)
      if (stockage.failPresign) {
        return echec("erreur-stockage", "échec mémoire de la pré-signature")
      }
      const valeur: ValeurPresignBrouillon = {
        uploadUrl: `memoire://upload/${input.draftId}`,
        previewUrl: `memoire://preview/${input.draftId}`,
      }
      return { ok: true, valeur }
    },

    async supprimerBrouillon(input) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsBrouillons.push(input.draftId)
      return { ok: true, valeur: null }
    },

    async promouvoirBrouillon(input) {
      if (stockage.failPromotion) {
        return echec("erreur-stockage", "échec mémoire de la promotion")
      }
      const publicUrl = `memoire://image/${input.draftId}`
      promotions.push({ draftId: input.draftId, publicUrl })
      const valeur: ValeurPromotionBrouillon = { publicUrl }
      return { ok: true, valeur }
    },

    async supprimerImagePromue(input) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsImagesPromues.push(input.draftId)
      return { ok: true, valeur: null }
    },

    async supprimerImagePersistee(publicUrl) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsImagesPersistees.push(publicUrl)
      return { ok: true, valeur: null }
    },

    async supprimerImageCategorie(publicUrl) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsImagesCategorie.push(publicUrl)
      return { ok: true, valeur: null }
    },
  }

  return stockage
}

/**
 * Les opérations du port de registre qu'un adaptateur en mémoire peut faire
 * échouer. Le module propriétaire les entoure toutes de `try/catch` et en tire
 * le refus « registre indisponible » — sauf `confirmerPromotion`, qui est
 * appelée dans la transaction du Catalogue et devient un refus de celui-ci.
 */
export type OperationRegistre =
  | "creer"
  | "lire"
  | "revendiquer"
  | "confirmerPromotion"
  | "annulerRevendication"
  | "marquerLibere"

export interface RegistreImageProduitMemoire extends PortRegistreBrouillonImageProduit {
  readonly records: Map<string, BrouillonImageProduit>
  /**
   * Les opérations qui lèvent au lieu de répondre, comme le ferait un registre
   * hors service. Sans elles les quatre refus « registre indisponible » du
   * module propriétaire n'ont aucun cas : un port qui ne peut pas échouer ne
   * prouve pas le chemin qui le rattrape.
   */
  readonly pannes: Set<OperationRegistre>
}

function copieBrouillon(
  brouillon: BrouillonImageProduit
): BrouillonImageProduit {
  return {
    ...brouillon,
    createdAt: new Date(brouillon.createdAt),
    expiresAt: new Date(brouillon.expiresAt),
  }
}

function refusRegistre(
  code: CodeRefusRegistreBrouillon,
  message: string
): Extract<ResultatRevendicationRegistre, { ok: false }> {
  return { ok: false, code, message }
}

/**
 * Même règle que le registre durable : la rétention dépassée résout en `expiré`
 * un Brouillon non lié à un Produit, quel que soit son état de revendication.
 * `libéré` reste terminal, un Brouillon lié à un Produit n'est jamais
 * réétiqueté.
 */
function resolubleEnExpire(
  brouillon: BrouillonImageProduit,
  now: Date
): boolean {
  return (
    brouillon.productId === null &&
    brouillon.expiresAt <= now &&
    (brouillon.state === "vivant" || brouillon.state === "revendiqué")
  )
}

export function creerRegistreImageProduitMemoire(
  maintenant: () => Date
): RegistreImageProduitMemoire {
  const records = new Map<string, BrouillonImageProduit>()
  const pannes = new Set<OperationRegistre>()

  /** Une panne lève comme le ferait une connexion perdue, jamais un refus. */
  function panne(operation: OperationRegistre): void {
    if (pannes.has(operation)) {
      throw new Error(`Registre en mémoire indisponible : ${operation}`)
    }
  }

  return {
    records,
    pannes,

    async creer(input: EntreeCreationBrouillonImageProduit) {
      panne("creer")
      const brouillon: BrouillonImageProduit = {
        id: input.id,
        mimeType: input.contentType,
        byteSize: input.byteSize,
        ownerId: input.ownerId,
        tentativeId: null,
        createdAt: maintenant(),
        expiresAt: new Date(input.expiresAt),
        state: "vivant",
        promotedPublicUrl: null,
        productId: null,
      }
      records.set(brouillon.id, brouillon)
      return copieBrouillon(brouillon)
    },

    async lire(id) {
      panne("lire")
      const brouillon = records.get(id)
      if (!brouillon) return null
      if (resolubleEnExpire(brouillon, maintenant())) {
        brouillon.state = "expiré"
      }
      return copieBrouillon(brouillon)
    },

    async revendiquer(input) {
      panne("revendiquer")
      const brouillon = records.get(input.id)
      if (!brouillon)
        return refusRegistre("introuvable", "Brouillon introuvable")
      if (brouillon.ownerId !== input.ownerId) {
        return refusRegistre(
          "proprietaire-incorrect",
          "Ce brouillon ne vous appartient pas"
        )
      }
      if (
        brouillon.state === "revendiqué" &&
        brouillon.tentativeId === input.tentativeId
      ) {
        return { ok: true, value: copieBrouillon(brouillon) }
      }
      if (brouillon.expiresAt <= input.now) {
        if (resolubleEnExpire(brouillon, input.now)) {
          brouillon.state = "expiré"
        }
        return refusRegistre("expire", "Ce brouillon a expiré")
      }
      if (brouillon.state !== "vivant" || brouillon.tentativeId !== null) {
        return refusRegistre(
          brouillon.state === "revendiqué"
            ? "deja-revendique"
            : brouillon.state === "libéré"
              ? "deja-libere"
              : "non-vivant",
          brouillon.state === "revendiqué"
            ? "Ce brouillon a déjà été revendiqué"
            : "Ce brouillon n'est pas vivant"
        )
      }
      brouillon.state = "revendiqué"
      brouillon.tentativeId = input.tentativeId
      return { ok: true, value: copieBrouillon(brouillon) }
    },

    async confirmerPromotion(input) {
      panne("confirmerPromotion")
      const brouillon = records.get(input.id)
      if (
        !brouillon ||
        brouillon.state !== "revendiqué" ||
        brouillon.tentativeId !== input.tentativeId
      ) {
        return false
      }
      if (
        (brouillon.productId !== null &&
          brouillon.productId !== input.productId) ||
        (brouillon.promotedPublicUrl !== null &&
          brouillon.promotedPublicUrl !== input.publicUrl)
      ) {
        return false
      }
      brouillon.productId = input.productId
      brouillon.promotedPublicUrl = input.publicUrl
      return true
    },

    /**
     * La compensation ne rend `vivant` que ce qui est encore `revendiqué` : un
     * Brouillon résolu en `expiré` garde son expiration, exactement comme le
     * registre durable, où la rétention décide de l'état indépendamment de la
     * compensation. Rendre un Brouillon expiré à `vivant` le laisserait
     * revendicable par une tentative alors que son objet a pu être supprimé.
     */
    async annulerRevendication(input) {
      panne("annulerRevendication")
      const brouillon = records.get(input.id)
      if (
        brouillon?.state === "revendiqué" &&
        brouillon.tentativeId === input.tentativeId &&
        brouillon.productId === null
      ) {
        brouillon.state = "vivant"
        brouillon.tentativeId = null
        brouillon.promotedPublicUrl = null
      }
    },

    /**
     * Comme le registre durable : la libération exige un Brouillon `vivant` et
     * une rétention non dépassée, et une rétention dépassée se résout en
     * `expiré` même ici. Une libération refusée pour rétention laisse donc le
     * Brouillon expiré des deux côtés.
     */
    async marquerLibere(input) {
      panne("marquerLibere")
      const brouillon = records.get(input.id)
      const now = maintenant()
      if (
        brouillon &&
        brouillon.ownerId === input.ownerId &&
        brouillon.state === "vivant" &&
        brouillon.expiresAt > now
      ) {
        brouillon.state = "libéré"
        return true
      }
      if (brouillon && resolubleEnExpire(brouillon, now)) {
        brouillon.state = "expiré"
      }
      return false
    },
  }
}

export interface HorlogeControllable {
  horloge: { maintenant(): Date }
  avancer(secondes: number): void
  fixer(date: Date): void
}

export function creerHorlogeControllable(
  dateInitiale: Date
): HorlogeControllable {
  let maintenant = new Date(dateInitiale)
  return {
    horloge: {
      maintenant: () => new Date(maintenant),
    },
    avancer(secondes) {
      maintenant = new Date(maintenant.getTime() + secondes * 1000)
    },
    fixer(date) {
      maintenant = new Date(date)
    },
  }
}

/**
 * Les deux formes d'une entrée de la Galerie produit, telles que le formulaire
 * les soumet. Ce sont des objets du module neutre, pas une déclaration seconde :
 * l'opération prend ce que l'éditeur a soumis, et ces deux aides ne font que
 * l'écrire plus lisiblement. Une suite qui a besoin d'autre chose — la
 * pré-signature d'une demande réelle, par exemple — garde la sienne.
 */
export function persistee(url: string): EntreeImageProduit {
  return { kind: "persistee", url }
}

export function brouillon(draftId: string): EntreeImageProduit {
  return {
    kind: "brouillon",
    draftId,
    previewUrl: `https://preview.test/${draftId}`,
  }
}

/**
 * La même revendication, dont la liaison confirme sans le port de transaction
 * du Catalogue.
 *
 * Le Catalogue passe toujours à la liaison le port de sa transaction, et ce
 * port écrit la rangée du Brouillon. Un registre en mémoire n'a pas de
 * transaction : reçu à sa place, le port confirme une rangée qui n'a jamais
 * été écrite, la liaison échoue, et le Catalogue refuse une galerie dont le
 * Brouillon est pourtant revendiqué — la sauvegarde échoue pour un Brouillon
 * correctement pris. Une suite qui conduit une vraie écriture du Catalogue à
 * travers un registre en mémoire reconstruit donc sa valeur ici, où le fait
 * s'écrit une fois au lieu de se répéter aux deux sites d'appel.
 *
 * La suite durable n'en a pas l'usage, et c'est le registre durable que le
 * port de transaction écrit : le lui remettre y est exactement juste.
 */
export function sansTransaction(
  revendication: RevendicationImagesProduit
): RevendicationImagesProduit {
  return RevendicationImagesProduit.creer({
    galerie: revendication.galerie,
    promues: revendication.promues,
    lier: (productId) => revendication.lier(productId),
  })
}

/**
 * Le cycle de vie complet, monté sur les trois adaptateurs en mémoire de ce
 * module : le stockage, le registre et l'horloge. L'instant initial reste un
 * fait de la suite — deux suites n'observent pas la même rétention depuis la
 * même date — donc il se passe ici ; les pannes et les traces qu'une suite
 * observe restent ensuite les siennes.
 */
export function creerCycleVieTest(dateInitiale: Date) {
  const horloge = creerHorlogeControllable(dateInitiale)
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  const cycleVie = creerCycleVieImageProduit({
    stockage,
    registre,
    horloge: horloge.horloge,
  })
  return { cycleVie, horloge, stockage, registre }
}
