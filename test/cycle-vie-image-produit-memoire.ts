import {
  classerRevendication,
  compensationAdmise,
  creerCycleVieImageProduit,
  reLabellableExpire,
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
 * La prose de cet adaptateur, un code par un. La classification partagée ne
 * porte aucun message — les deux adaptateurs n'écrivent pas les mêmes, et c'est
 * très bien ainsi : le module propriétaire compose le sien autour des codes, et
 * `deja-libere` porte ici la même phrase que `non-vivant`, comme avant.
 */
const MESSAGE_PAR_CODE: Record<CodeRefusRegistreBrouillon, string> = {
  introuvable: "Brouillon introuvable",
  "proprietaire-incorrect": "Ce brouillon ne vous appartient pas",
  expire: "Ce brouillon a expiré",
  "deja-revendique": "Ce brouillon a déjà été revendiqué",
  "deja-libere": "Ce brouillon n'est pas vivant",
  "non-vivant": "Ce brouillon n'est pas vivant",
}

/**
 * La rangée peut-elle porter l'écriture qu'une revendication autorise ?
 *
 * La classification autorise aussi un Brouillon libéré, et un `vivant` qui
 * garde une tentative — celui qu'une compensation laisse derrière elle quand
 * elle échoue à moitié. La base ne les écrit pas : sa clause de
 * comparaison-and-échange ne les retient pas, et l'écriture qui ne prend rien
 * la fait retomber sur sa relecture, qui rend le même refus. Cette fonction est
 * donc la transcription de cette clause, et la seule règle qui reste écrite deux
 * fois : elle est un fait de stockage plutôt qu'une règle de domaine, et #500
 * l'épingle des deux côtés.
 */
export function recevable(brouillon: BrouillonImageProduit): boolean {
  return brouillon.state === "vivant" && brouillon.tentativeId === null
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
      // Deux questions, deux règles : la règle dit ce que cette rangée peut
      // devenir, et l'appelant est le seul à savoir de quelle rétention il
      // parle. Une lecture n'a pas de revendication à fabriquer pour emprunter
      // son verdict.
      const now = maintenant()
      if (brouillon.expiresAt <= now && reLabellableExpire(brouillon)) {
        brouillon.state = "expiré"
      }
      return copieBrouillon(brouillon)
    },

    /**
     * La revendication est la règle du module propriétaire plus deux écritures.
     * Ce qui restait ici — l'échelle de cinq barreaux, le ternaire du refus non
     * vivant, le prédicat d'expiration — était la troisième écriture d'une
     * règle que le registre durable écrivait de son côté.
     */
    async revendiquer(input) {
      panne("revendiquer")
      const brouillon = records.get(input.id)

      // Cette branche ne décide rien : la classification rend `introuvable` pour
      // une rangée absente, et sa suite le prouve. Elle n'est là que pour que le
      // type se resserre sur la rangée, sans quoi les trois écritures en dessous
      // porteraient toutes un `!`.
      if (!brouillon) {
        return refusRegistre("introuvable", MESSAGE_PAR_CODE["introuvable"])
      }

      const verdict = classerRevendication(brouillon, {
        ownerId: input.ownerId,
        tentativeId: input.tentativeId,
        now: input.now,
      })

      // Un rejeu est un succès rendu, pas une écriture : la tentative a déjà pris
      // ce Brouillon, et le réécrire ne rendrait rien que la règle ne dise déjà.
      if (verdict.kind === "rejoue") {
        return { ok: true, value: copieBrouillon(brouillon) }
      }

      if (verdict.kind === "tranche") {
        // Trancher n'est pas réétiqueter : la rétention est échue, mais dire que
        // cette rangée-là peut le devenir est une autre question.
        if (verdict.code === "expire" && reLabellableExpire(brouillon)) {
          brouillon.state = "expiré"
        }
        return refusRegistre(verdict.code, MESSAGE_PAR_CODE[verdict.code])
      }

      // Le verdict autorise l'écriture ; la rangée doit pouvoir la recevoir. Il
      // autorise aussi un Brouillon libéré, qu'aucune écriture ne peut réveiller
      // — c'est à cette étroite condition que la base répondrait pareil, par sa
      // relecture. #500 nomme cet écart et épingle la clause des deux côtés.
      if (!recevable(brouillon)) {
        return refusRegistre(
          verdict.refusalSiEchec,
          MESSAGE_PAR_CODE[verdict.refusalSiEchec]
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
     * La compensation rend `vivant` ce que la règle du module propriétaire lui
     * accorde, et rien de plus : un Brouillon d'Image produit pris par cette
     * tentative, encore `revendiqué`, et lié à aucun Produit. Un Brouillon
     * résolu en `expiré` garde son expiration — le rendre revendicable alors que
     * son objet a pu être supprimé par la règle de cycle de vie R2 nuirait à
     * l'éditeur sans rien lui rendre ; un Brouillon libéré ou déjà lié à un
     * Produit n'a plus rien à rendre du tout.
     *
     * Ne rien trouver n'est pas un échec : le port rend `void`, et l'appelant
     * n'a donc rien à rattraper.
     */
    async annulerRevendication(input) {
      panne("annulerRevendication")
      const brouillon = records.get(input.id)
      if (!compensationAdmise(brouillon, input.tentativeId)) return
      brouillon.state = "vivant"
      brouillon.tentativeId = null
      brouillon.promotedPublicUrl = null
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
      if (
        brouillon &&
        brouillon.expiresAt <= now &&
        reLabellableExpire(brouillon)
      ) {
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
