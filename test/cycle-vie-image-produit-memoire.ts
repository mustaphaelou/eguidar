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
import {
  DRAFT_PRODUCTS_PREFIX,
  MAX_UPLOAD_SIZE,
  PRODUCTS_PREFIX,
  draftObjectKey,
  objectKeyFromPublicUrl,
  persistentObjectKey,
  publicUrlFromKey,
  type CodeEchecStockage,
  type ContentTypeImageProduit,
  type EchecStockageImageProduit,
  type PortStockageImageProduit,
  type ResultatStockageImageProduit,
  type ValeurPromotionBrouillon,
  type ValeurPresignBrouillon,
} from "@/lib/r2"

/**
 * La base publique sous laquelle cet adaptateur range ce qu'il adresse. Elle
 * est fixe comme l'est la configuration d'un bucket : une suite ne la choisit
 * pas, elle s'y attend, et c'est ce qui rend l'adresse d'une Image produit
 * lisible — `https://cdn.example.test/products/draft-1.webp` — là où elle
 * n'était qu'une chaîne dont personne ne pouvait dire la forme.
 */
export const BASE_PUBLIQUE_MEMOIRE = "https://cdn.example.test"

/**
 * L'endpoint d'envoi, distinct de la base publique comme l'est celui de la
 * production : la pré-signature adresse le bucket, l'aperçu sert l'URL publique.
 * Un R2 en mémoire n'a pas de clé privée, donc aucune signature à faire —
 * l'adresse d'envoi se dérive de la même clé que l'aperçu, sur une autre base.
 */
export const BASE_ENVOI_MEMOIRE = "https://upload.example.test"

/**
 * L'URL publique d'une clé. La conversion est celle du module de stockage,
 * comme la dérivation ; la base étant une constante du module, elle ne rend
 * jamais `null` ici. Une base vide serait un défaut de ce module et non une
 * panne du stockage qu'une suite rejoue, donc elle lève au lieu de rendre un
 * refus que rien ne pourrait atteindre.
 */
function urlPublique(cle: string): string {
  const url = publicUrlFromKey(cle, BASE_PUBLIQUE_MEMOIRE)
  if (!url) throw new Error(`Base publique vide : ${BASE_PUBLIQUE_MEMOIRE}`)
  return url
}

/** L'adresse d'envoi d'une clé : le bucket, pas l'URL publique. */
function urlEnvoi(cle: string): string {
  return `${BASE_ENVOI_MEMOIRE}/${cle}`
}

function echec(
  code: CodeEchecStockage,
  message: string
): { ok: false; erreur: EchecStockageImageProduit } {
  return { ok: false, erreur: { code, message } }
}

/**
 * La dérivation d'une clé et le refus qu'elle peut rendre, dans la forme que
 * l'adaptateur de production leur donne : la dérivation lève, l'opération
 * répond `parametre-invalide`. Les six opérations du port lisent l'exception
 * de la même façon, et c'est ce qui fait d'un identifiant indéparable un refus
 * plutôt qu'une panne du test.
 */
function cleOuRefus(
  deriver: () => string
): ResultatStockageImageProduit<string> {
  try {
    return { ok: true, valeur: deriver() }
  } catch (error) {
    return echec(
      "parametre-invalide",
      error instanceof Error ? error.message : "Paramètre de stockage invalide"
    )
  }
}

/**
 * La clé qu'une suppression par URL adresse, ou le refus qui la remplace.
 *
 * Une URL que la base publique ne nomme pas n'a pas de clé, donc pas
 * d'adresse : elle se refuse en `parametre-invalide` comme en production, et
 * comme elle ne vise rien, rien ne s'enregistre. C'est le seul endroit où une
 * clé est relite depuis une URL, donc le seul qui exerce l'aller-retour.
 */
function cleSupprimeeParUrl(
  publicUrl: string,
  dansEspaceDeNoms: (cle: string) => boolean
): ResultatStockageImageProduit<string> {
  const cle = objectKeyFromPublicUrl(publicUrl, BASE_PUBLIQUE_MEMOIRE)
  if (!cle || !dansEspaceDeNoms(cle)) {
    return echec(
      "parametre-invalide",
      "URL non gérée par le stockage en mémoire"
    )
  }
  return { ok: true, valeur: cle }
}

/**
 * Les deux gardes d'espace de noms, réécrites ici comme le registre en mémoire
 * réécrit les règles durables : elles ne sont pas exportées par le module de
 * stockage, et un adaptateur qui veut appliquer la même frontière doit la
 * redire. Le préfixe, lui, vient de là — il est le fait public que la règle de
 * cycle de vie R2 épingle, et le retaper ici serait exactement le risque que
 * cet export existe pour écarter.
 *
 * Une Image produit persistée n'existe que sous `products/`, hors du préfixe
 * réservé aux Brouillons. Une image de Structure est le champ `image` d'une
 * catégorie, antérieure à ce cycle de vie : elle est n'importe où sous la base
 * publique — y compris sous `products/`, comportement conservé pour les
 * catégories — mais jamais dans l'espace réservé, dont l'expiration est le fait
 * de la règle R2 (ADR-0004).
 */
function estCleImageProduitPersistee(cle: string): boolean {
  return (
    cle.startsWith(PRODUCTS_PREFIX) && !cle.startsWith(DRAFT_PRODUCTS_PREFIX)
  )
}

function estCleImageCategorie(cle: string): boolean {
  return !cle.startsWith(DRAFT_PRODUCTS_PREFIX)
}

export interface StockageImageProduitMemoire extends PortStockageImageProduit {
  readonly presignatures: Array<{
    draftId: string
    contentType: ContentTypeImageProduit
    size: number
    /** La clé visée, sous l'espace réservé aux Brouillons. */
    cle: string
  }>
  readonly promotions: Array<{
    draftId: string
    /** La clé copiée en source, toujours sous l'espace réservé aux Brouillons. */
    cleSource: string
    /** La clé écrite en destination, hors de l'espace réservé. */
    cle: string
    publicUrl: string
  }>
  /** Les clés de Brouillon supprimées, sous `products/brouillons/`. */
  readonly suppressionsBrouillons: string[]
  /** Les clés persistantes supprimées, sous `products/` et hors du réservé. */
  readonly suppressionsImagesPromues: string[]
  readonly suppressionsImagesPersistees: string[]
  readonly suppressionsImagesCategorie: string[]
  /**
   * Les trois indicateurs booléens que l'adaptateur portait déjà : le
   * brouillard le plus grossier, celui qu'une suite atteint quand tout le
   * stockage est mort. `pannes` ci-dessous dit la même chose opération par
   * opération et atteint en plus ce qu'un booléen ne sait pas dire.
   */
  failPresign: boolean
  failPromotion: boolean
  failDelete: boolean
  /**
   * Les pannes, par opération : chacune des six peut répondre l'un des trois
   * codes que le port sait exprimer, ou lever comme le ferait une connexion
   * perdue. La levée est le seul mode qu'aucun des trois indicateurs ne sait
   * produire, et c'est elle qui donne enfin un cas aux deux `catch` du module
   * propriétaire qui rattrapent une exception du stockage.
   */
  readonly pannes: Record<OperationStockage, Set<PanneStockage>>
}

/**
 * Les six opérations du port de stockage, celles qu'un adaptateur en mémoire
 * peut faire échouer. C'est le port qui les nomme, et non une liste recopiée
 * ici : une opération qu'il gagnerait imposerait à cet enregistrement une clé
 * de plus.
 */
export type OperationStockage = keyof PortStockageImageProduit

/**
 * Les trois refus que le port sait exprimer, plus la levée — la seule façon
 * qu'il ait de ne pas répondre du tout.
 */
export type PanneStockage =
  "non-configure" | "parametre-invalide" | "erreur-stockage" | "leve"

/**
 * L'URL publique d'une Image produit persistée, dérivée comme la production la
 * dérive. Les suites du cycle de vie l'importent plutôt que de la recomposer :
 * une adresse attendue qui refait la dérivation à la main peut être fausse
 * exactement comme l'adaptateur, et ne prouve alors plus rien.
 */
export function urlImagePersistee(
  imageId: string,
  contentType: ContentTypeImageProduit
): string {
  return urlPublique(persistentObjectKey(imageId, contentType))
}

/**
 * L'aperçu d'un Brouillon : l'URL publique que son objet occupera tant qu'il
 * n'est pas promu.
 */
export function urlApercuBrouillon(
  draftId: string,
  contentType: ContentTypeImageProduit
): string {
  return urlPublique(draftObjectKey(draftId, contentType))
}

/** L'adresse d'envoi que la pré-signature rend à l'éditeur. */
export function urlEnvoiBrouillon(
  draftId: string,
  contentType: ContentTypeImageProduit
): string {
  return urlEnvoi(draftObjectKey(draftId, contentType))
}

export function creerStockageImageProduitMemoire(): StockageImageProduitMemoire {
  const presignatures: StockageImageProduitMemoire["presignatures"] = []
  const promotions: StockageImageProduitMemoire["promotions"] = []
  const suppressionsBrouillons: string[] = []
  const suppressionsImagesPromues: string[] = []
  const suppressionsImagesPersistees: string[] = []
  const suppressionsImagesCategorie: string[] = []
  // L'annotation est ce qui tient l'exhaustivité : une opération que le port
  // gagnerait imposerait ici une clé de plus, et `tsc --noEmit` le dirait.
  const pannes: Record<OperationStockage, Set<PanneStockage>> = {
    presignerBrouillon: new Set(),
    supprimerBrouillon: new Set(),
    promouvoirBrouillon: new Set(),
    supprimerImagePromue: new Set(),
    supprimerImagePersistee: new Set(),
    supprimerImageCategorie: new Set(),
  }

  /**
   * La panne que l'opération est contrainte de subir, ou `null` quand elle
   * réussit. Les trois indicateurs booléens sont lus ici et nulle part ailleurs :
   * ils disent le brouillard que `pannes` dit plus précisément, et les deux
   * mécanismes n'en font qu'un — le second l'emporte quand il parle.
   */
  function panne(
    operation: OperationStockage,
    brouillard: boolean
  ): { ok: false; erreur: EchecStockageImageProduit } | null {
    const subies = pannes[operation]
    if (subies.has("leve")) {
      throw new Error(`Stockage en mémoire indisponible : ${operation}`)
    }
    if (subies.has("non-configure")) {
      return echec("non-configure", "Stockage en mémoire non configuré")
    }
    if (subies.has("parametre-invalide")) {
      return echec("parametre-invalide", "Paramètre de stockage invalide")
    }
    if (subies.has("erreur-stockage") || brouillard) {
      return echec("erreur-stockage", `échec mémoire de ${operation}`)
    }
    return null
  }

  const stockage: StockageImageProduitMemoire = {
    presignatures,
    promotions,
    suppressionsBrouillons,
    suppressionsImagesPromues,
    suppressionsImagesPersistees,
    suppressionsImagesCategorie,
    pannes,
    failPresign: false,
    failPromotion: false,
    failDelete: false,

    async presignerBrouillon(input) {
      const resolue = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      const cle = resolue.valeur
      presignatures.push({ ...input, cle })
      if (
        !Number.isInteger(input.size) ||
        input.size <= 0 ||
        input.size > MAX_UPLOAD_SIZE
      ) {
        return echec(
          "parametre-invalide",
          input.size > MAX_UPLOAD_SIZE
            ? "Fichier trop volumineux (10 Mo maximum)"
            : "Taille de fichier invalide"
        )
      }
      const refus = panne("presignerBrouillon", stockage.failPresign)
      if (refus) return refus
      const valeur: ValeurPresignBrouillon = {
        uploadUrl: urlEnvoi(cle),
        previewUrl: urlPublique(cle),
      }
      return { ok: true, valeur }
    },

    async supprimerBrouillon(input) {
      const resolue = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      suppressionsBrouillons.push(resolue.valeur)
      const refus = panne("supprimerBrouillon", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },

    async promouvoirBrouillon(input) {
      const source = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!source.ok) return source
      const destination = cleOuRefus(() =>
        persistentObjectKey(input.draftId, input.contentType)
      )
      if (!destination.ok) return destination

      const publicUrl = urlPublique(destination.valeur)
      promotions.push({
        draftId: input.draftId,
        cleSource: source.valeur,
        cle: destination.valeur,
        publicUrl,
      })
      const refus = panne("promouvoirBrouillon", stockage.failPromotion)
      if (refus) return refus
      const valeur: ValeurPromotionBrouillon = { publicUrl }
      return { ok: true, valeur }
    },

    async supprimerImagePromue(input) {
      const resolue = cleOuRefus(() =>
        persistentObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      suppressionsImagesPromues.push(resolue.valeur)
      const refus = panne("supprimerImagePromue", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },

    async supprimerImagePersistee(publicUrl) {
      const resolue = cleSupprimeeParUrl(publicUrl, estCleImageProduitPersistee)
      if (!resolue.ok) return resolue
      suppressionsImagesPersistees.push(resolue.valeur)
      const refus = panne("supprimerImagePersistee", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },

    async supprimerImageCategorie(publicUrl) {
      const resolue = cleSupprimeeParUrl(publicUrl, estCleImageCategorie)
      if (!resolue.ok) return resolue
      suppressionsImagesCategorie.push(resolue.valeur)
      const refus = panne("supprimerImageCategorie", stockage.failDelete)
      if (refus) return refus
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
