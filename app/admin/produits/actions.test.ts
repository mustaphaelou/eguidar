/**
 * L'enregistrement d'un Produit, de bout en bout.
 *
 * Cette suite conduit l'**opération réelle** du cycle de vie. La seule
 * instance que l'action atteint est l'instance par défaut du module — celle
 * qui, en production, tient le stockage R2 et le registre Prisma ; elle est
 * remplacée ici par une instance du même code de fabrication, bâtie sur les
 * adaptateurs en mémoire du dépôt. Le découpage de la galerie, la
 * revendication, la promotion, le réassemblage dans l'ordre de l'éditeur et la
 * compensation sont donc ceux de `lib/cycle-vie-image-produit.ts`, pas ceux
 * d'un double.
 *
 * **Ce qu'elle affirme, et rien d'autre :** le résultat que l'éditeur obtient,
 * la Galerie produit enregistrée, l'état du registre. **Ce qu'elle n'affirme
 * plus :** quelles fonctions l'appelant a composées, ni comment il a découpé sa
 * galerie. Un fait vraiment privé — l'ordre d'une promotion, la forme d'une
 * compensation — se prouve à l'interface du cycle de vie, dans
 * `lib/cycle-vie-image-produit.test.ts`.
 *
 * Le Catalogue est le seul faux de la suite, et il en est aussi le seul
 * témoin : la mutation réelle tape la base, cette suite ne l'a pas. Il joue le
 * rôle que la mutation joue en production — écrire la rangée du Produit, lier
 * les Brouillons dans la même opération — et se souvient de ce qu'il a écrit,
 * pour que « le Catalogue est écrit / n'est pas écrit / avec quelle galerie »
 * se lise sans regarder la façon dont l'action l'a demandé. Le stockage et le
 * registre, eux, ne sont pas des faux : ce sont les vrais ports, sur leurs
 * adaptateurs en mémoire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RevendicationImagesProduit } from "@/lib/cycle-vie-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type {
  CatalogEffects,
  ProductInput,
} from "@/lib/use-cases/admin-catalog"
import type { Client } from "@/lib/use-cases/session-courante"
import {
  brouillon,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

/**
 * Le monde que la suite conduit : l'opération réelle du cycle de vie, bâtie sur
 * le stockage et le registre en mémoire.
 *
 * `vi.hoisted` parce que l'action atteint son instance **par défaut** à
 * l'import : c'est cette instance-là qu'il faut remplacer, et le remplacement
 * doit donc être prêt avant que quoi que ce soit ne soit importé. Ce qui la
 * remplace n'est pas un `vi.fn()` mais une seconde instance de
 * `creerCycleVieImageProduit` — la même fonction, deux fois.
 */
const { cycleVie, horloge, instant, registre, stockage } = await vi.hoisted(
  async () => {
    const [module, adaptateurs] = await Promise.all([
      import("@/lib/cycle-vie-image-produit"),
      import("@/test/cycle-vie-image-produit-memoire"),
    ])
    const instant = new Date("2026-01-15T10:00:00.000Z")
    const horloge = adaptateurs.creerHorlogeControllable(instant)
    const stockage = adaptateurs.creerStockageImageProduitMemoire()
    const registre = adaptateurs.creerRegistreImageProduitMemoire(() =>
      horloge.horloge.maintenant()
    )
    return {
      instant,
      horloge,
      stockage,
      registre,
      cycleVie: module.creerCycleVieImageProduit({
        stockage,
        registre,
        horloge: horloge.horloge,
      }),
    }
  }
)

/** Le Catalogue, faux et témoin. Voir l'en-tête de la suite. */
const catalogue = vi.hoisted(creerCatalogueFaux)

vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/navigation-mocks")
  return { redirect: mocks.redirectMock }
})

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/use-cases/session-courante")
  >()),
  lireSession: sessionCouranteMock,
}))

vi.mock("@/lib/use-cases/admin-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/admin-catalog")>()),
  createProduct: (
    champs: ProductInput,
    _effets: Partial<CatalogEffects> | undefined,
    revendication: RevendicationImagesProduit | undefined
  ) => catalogue.creer(champs, revendication),
  updateProduct: (
    produitId: string,
    champs: ProductInput,
    _effets: Partial<CatalogEffects> | undefined,
    revendication: RevendicationImagesProduit | undefined
  ) => catalogue.mettreAJour(produitId, champs, revendication),
  getAdminProduct: (produitId: string) =>
    Promise.resolve(catalogue.relire(produitId)),
}))

vi.mock("@/lib/cycle-vie-image-produit", async (importOriginal) => {
  const reel =
    await importOriginal<typeof import("@/lib/cycle-vie-image-produit")>()
  return { ...reel, default: cycleVie }
})

import {
  createProductAction,
  updateProductAction,
} from "@/app/admin/produits/actions"
import { CatalogValidationError } from "@/lib/use-cases/admin-catalog"

const ADMIN: Client = {
  id: "editeur-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

/** Ce que le Catalogue a écrit : le Produit, et la galerie qu'il lui a donnée. */
interface EcritureCatalogue {
  readonly produitId: string
  readonly galerie: readonly string[]
}

/**
 * Ce que le Catalogue relit d'un Produit : son identité et sa galerie, le
 * strict nécessaire pour qu'une relecture réponde « ce commit existe » ou
 * « il n'existe pas ». L'action n'en lit rien d'autre, et la suite non plus.
 */
interface ProduitRelu {
  readonly id: string
  readonly images: readonly string[]
}

interface CatalogueFaux {
  /** Les écritures acceptées, dans l'ordre où le Catalogue les a écrites. */
  readonly ecritures: EcritureCatalogue[]
  /** Le refus que rendra la prochaine écriture, ou `null` pour qu'elle passe. */
  refus: Error | null
  creer(
    champs: ProductInput,
    revendication?: RevendicationImagesProduit
  ): Promise<{ id: string }>
  mettreAJour(
    produitId: string,
    champs: ProductInput,
    revendication?: RevendicationImagesProduit
  ): Promise<{ id: string }>
  relire(produitId: string): ProduitRelu | null
  oublier(): void
}

function creerCatalogueFaux(): CatalogueFaux {
  const ecritures: EcritureCatalogue[] = []
  let compteur = 0

  /**
   * L'écriture, comme la mutation la fait : la rangée du Produit et la liaison
   * des Brouillons sont la même opération, et un refus — validation d'entrée,
   * règle de création, transaction avortée — tombe avant l'une comme avant
   * l'autre. Un refus ne laisse donc rien derrière lui.
   */
  async function ecrire(
    produitId: string,
    champs: ProductInput,
    revendication?: RevendicationImagesProduit
  ): Promise<{ id: string }> {
    if (faux.refus) throw faux.refus
    if (revendication) await revendication.lier(produitId)
    ecritures.push({ produitId, galerie: [...champs.images] })
    return { id: produitId }
  }

  const faux: CatalogueFaux = {
    ecritures,
    refus: null,
    creer(champs, revendication) {
      compteur += 1
      return ecrire(`produit-${compteur}`, champs, revendication)
    },
    mettreAJour(produitId, champs, revendication) {
      return ecrire(produitId, champs, revendication)
    },
    relire(produitId) {
      const ecriture = ecritures.find(
        ({ produitId: ecrit }) => ecrit === produitId
      )
      if (!ecriture) return null
      return { id: produitId, images: [...ecriture.galerie] }
    },
    oublier() {
      ecritures.length = 0
      compteur = 0
      faux.refus = null
    },
  }

  return faux
}

beforeEach(() => {
  sessionCouranteMock.mockResolvedValue(ADMIN)
  redirectMock.mockClear()
  catalogue.oublier()
  // L'instance est unique pour toute la suite — c'est elle que l'action atteint
  // à l'import — donc chaque cas repart d'un registre, d'un stockage et d'une
  // horloge neufs, comme le ferait une base vide.
  registre.records.clear()
  stockage.presignatures.length = 0
  stockage.promotions.length = 0
  stockage.suppressionsBrouillons.length = 0
  stockage.suppressionsImagesPromues.length = 0
  stockage.failPresign = false
  stockage.failPromotion = false
  stockage.failDelete = false
  for (const pannes of Object.values(stockage.pannes)) pannes.clear()
  horloge.fixer(instant)
})

/**
 * Un Brouillon réellement téléversé : la demande passe par l'interface du
 * cycle de vie, comme celle de l'éditeur. La suite ne fabrique donc jamais une
 * entrée de registre à la main — elle en a une parce que l'éditeur l'a eue.
 */
async function televerser(ownerId = ADMIN.id): Promise<string> {
  const demande = await cycleVie.demanderBrouillon({
    ownerId,
    contentType: "image/webp",
    size: 2048,
  })
  if (!demande.ok) throw new Error("La demande de Brouillon devait réussir")
  return demande.draftId
}

function formData(
  galerie: EntreeImageProduit[],
  tentativeId = "tentative-1"
): FormData {
  const data = new FormData()
  data.append("name", "Produit")
  data.append("slug", "produit-de-test")
  data.append("brand", "Marque")
  data.append("categoryId", "categorie-1")
  data.append("description", "Description")
  data.append("price", "100")
  data.append("images", JSON.stringify(galerie))
  data.append(
    "variants",
    JSON.stringify([
      { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 2 },
    ])
  )
  data.append("tentativeId", tentativeId)
  return data
}

function updateFormData(
  galerie: EntreeImageProduit[],
  tentativeId = "tentative-update-1"
): FormData {
  const data = formData(galerie, tentativeId)
  data.append("productId", "produit-1")
  return data
}

describe("createProductAction", () => {
  it("enregistre la galerie soumise dans l'ordre de l'éditeur, et lie le Produit au Brouillon promu", async () => {
    // Le cas ordinaire d'une création qui téléverse : une Image produit déjà
    // enregistrée, puis un Brouillon. L'éditeur atterrit sur le Produit écrit,
    // et la galerie écrite est celle qu'il a arrangée — le Brouillon ayant pris
    // la place de l'aperçu qu'il venait de téléverser.
    const draftId = await televerser()
    const existante = "https://cdn.test/produits/existante.webp"

    await expect(
      createProductAction(
        {},
        formData([persistee(existante), brouillon(draftId)])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [existante, urlImagePersistee(draftId, "image/webp")],
      },
    ])
    // Le registre dit à qui appartient l'Image produit : à ce Produit, et à
    // personne d'autre.
    expect(registre.records.get(draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(draftId, "image/webp"),
    })
  })

  it("crée un Produit sans image, et lui en donnera par une mise à jour", async () => {
    // Le cas dégénéré : l'Administration crée son Produit avant de téléverser
    // la moindre image. Une galerie sans Brouillon est un cas légal, pas un
    // refus.
    await expect(createProductAction({}, formData([]))).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.ecritures).toEqual([
      { produitId: "produit-1", galerie: [] },
    ])
    // Aucune entrée de registre : il n'y avait rien à revendiquer.
    expect(registre.records.size).toBe(0)
  })

  it("refuse une création qui porte une Image produit déjà enregistrée, sans rien écrire", async () => {
    // La règle de création est celle du Catalogue : une création n'écrit que
    // des URL que la même opération a promues, donc une Image produit déjà
    // enregistrée appartient à un autre Produit. Cette règle est prouvée contre
    // la base dans `lib/use-cases/admin-catalog.test.ts` ; ici le Catalogue se
    // contente de faire ce qu'il fait en production, refuser.
    const messageRegle =
      "une création ne peut écrire que des Images produit téléversées dans sa galerie ; une Image produit déjà enregistrée appartient à un autre Produit"
    const draftId = await televerser()
    catalogue.refus = new CatalogValidationError([messageRegle])

    const resultat = await createProductAction(
      {},
      formData([
        persistee("https://cdn.test/produits/dun-autre-produit.webp"),
        brouillon(draftId),
      ])
    )

    // Le refus du Catalogue atteint l'éditeur comme n'importe quel refus de
    // validation d'un champ, message pour message.
    expect(resultat).toEqual({ error: `Données invalides : ${messageRegle}` })
    expect(catalogue.ecritures).toEqual([])
    // Et il ne coûte rien à l'éditeur : son Brouillon est rendu intact, sans
    // tentative et sans Produit.
    expect(registre.records.get(draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("remet un refus du cycle de vie à l'éditeur comme le sien, sans laisser de trace", async () => {
    // Le refus vient du registre, pas d'un double : l'éditeur soumet un
    // Brouillon qu'il a téléversé, puis un Brouillon qui appartient à un autre
    // éditeur. Le sien a déjà été pris quand l'échec tombe.
    const mien = await televerser()
    const autre = await televerser("editeur-2")

    const resultat = await createProductAction(
      {},
      formData([brouillon(mien), brouillon(autre)])
    )

    expect(resultat).toEqual({ error: "Ce brouillon ne vous appartient pas" })
    expect(catalogue.ecritures).toEqual([])
    // Rien n'a été promu, et le Brouillon déjà pris est rendu : la création
    // refusée ne laisse derrière elle ni écriture, ni image, ni revendication.
    expect(stockage.promotions).toEqual([])
    expect(registre.records.get(mien)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
    expect(registre.records.get(autre)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("soumettre deux fois le même formulaire résout au même Produit, sans réécrire le Catalogue", async () => {
    // Le double-clic de l'éditeur. Le second envoi reconnaît la tentative : la
    // revendication est déjà liée à un Produit, donc l'opération relit le
    // commit durable au lieu d'écrire une seconde rangée. Si la relecture ne
    // rendait rien, l'action lèverait au lieu de rediriger — la redirection
    // est donc la preuve que le second envoi a résolu vers `produit-1`.
    const draftId = await televerser()
    const soumission = formData([brouillon(draftId)])

    await expect(createProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })
    await expect(createProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/produit-1",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [urlImagePersistee(draftId, "image/webp")],
      },
    ])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: "produit-1",
    })
  })
})

describe("updateProductAction", () => {
  it("enregistre la galerie soumise : un Brouillon intercalé atterrit entre les Images produit persistées", async () => {
    // La galerie est soumise telle que l'éditeur l'a arrangée : persistée,
    // Brouillon, persistée, Brouillon. Ce qu'il verra dans son edition est
    // cette galerie, pas une autre.
    const premier = await televerser()
    const second = await televerser()
    const premierePersistee = "https://cdn.test/produits/premiere.webp"
    const secondePersistee = "https://cdn.test/produits/seconde.webp"

    await expect(
      updateProductAction(
        {},
        updateFormData([
          persistee(premierePersistee),
          brouillon(premier),
          persistee(secondePersistee),
          brouillon(second),
        ])
      )
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [
          premierePersistee,
          urlImagePersistee(premier, "image/webp"),
          secondePersistee,
          urlImagePersistee(second, "image/webp"),
        ],
      },
    ])
    expect(registre.records.get(premier)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-update-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(premier, "image/webp"),
    })
    expect(registre.records.get(second)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-update-1",
      productId: "produit-1",
      promotedPublicUrl: urlImagePersistee(second, "image/webp"),
    })
  })

  it("laisse le Catalogue refuser une Image produit absente du stock du Produit, sans rien écrire", async () => {
    // L'unique point d'application de la propriété d'une Image produit
    // persistée reste la mutation du Catalogue. La règle elle-même est prouvée
    // contre la base ; ici le Catalogue refuse, et l'éditeur reçoit son refus.
    const draftId = await televerser()
    catalogue.refus = new CatalogValidationError([
      "une Image produit persistée n'appartient pas à ce Produit",
    ])

    const resultat = await updateProductAction(
      {},
      updateFormData([
        persistee("https://cdn.test/produits/dun-autre-produit.webp"),
        brouillon(draftId),
      ])
    )

    expect(resultat).toEqual({
      error:
        "Données invalides : une Image produit persistée n'appartient pas à ce Produit",
    })
    expect(catalogue.ecritures).toEqual([])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("laisse chaque Brouillon revendicable après un échec de l'écriture, et le retry le promeut à nouveau", async () => {
    // Un incident ordinaire, pas un refus d'affaires : le Catalogue lève, et le
    // mot reste le sien. Ce qui compte pour l'éditeur, c'est la suite.
    const draftId = await televerser()
    const soumission = updateFormData([brouillon(draftId)])
    catalogue.refus = new Error("échec transactionnel")

    const echec = await updateProductAction({}, soumission)

    expect(echec).toEqual({ error: "L'enregistrement du Catalogue a échoué" })
    expect(catalogue.ecritures).toEqual([])
    // Le Brouillon est exactement où l'éditeur l'avait laissé : vivant, sans
    // tentative et sans Produit — donc encore revendicable, y compris par la
    // tentative qui vient d'échouer.
    expect(registre.records.get(draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
    // Et sa source est encore en place : c'est elle que le retry promeut.
    expect(stockage.suppressionsBrouillons).toEqual([])

    catalogue.refus = null
    await expect(updateProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [urlImagePersistee(draftId, "image/webp")],
      },
    ])
    // Le même Brouillon a été promu une seconde fois : sans sa source, le
    // retry n'aurait rien eu à promouvoir.
    expect(stockage.promotions.map((promotion) => promotion.draftId)).toEqual([
      draftId,
      draftId,
    ])
  })

  it("un retry de la même tentative relit le commit et ne réécrit pas le Catalogue", async () => {
    // Le retry de la mise à jour passe par la même relecture que celui de la
    // création — une seule relecture, écrite une fois. La redirection prouve
    // qu'elle a rendu le Produit : sans elle, l'action lèverait.
    const draftId = await televerser()
    const soumission = updateFormData([brouillon(draftId)])

    await expect(updateProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })
    await expect(updateProductAction({}, soumission)).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits",
    })

    expect(catalogue.ecritures).toEqual([
      {
        produitId: "produit-1",
        galerie: [urlImagePersistee(draftId, "image/webp")],
      },
    ])
    expect(registre.records.get(draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-update-1",
      productId: "produit-1",
    })
  })

  it("remonte le refus de la limite d'Images produit comme un refus de champ", async () => {
    // La lecture de la soumission ne refuse pas une galerie trop grande : elle
    // rend une galerie valide, et la limite est une règle du Catalogue, rendue
    // à l'éditeur comme n'importe quel refus de validation d'un champ. Une
    // galerie de neuf Images produit est aussi une galerie sans Brouillon.
    const galerieAuDelaDeLaLimite = Array.from({ length: 9 }, (_vide, i) =>
      persistee(`https://cdn.test/produits/${i + 1}.webp`)
    )
    catalogue.refus = new CatalogValidationError([
      "au maximum 8 images par produit",
    ])

    const resultat = await updateProductAction(
      {},
      updateFormData(galerieAuDelaDeLaLimite)
    )

    expect(resultat).toEqual({
      error: "Données invalides : au maximum 8 images par produit",
    })
    expect(catalogue.ecritures).toEqual([])

    // Comparaison, pas littéral : un refus de lecture de soumission et un refus
    // du Catalogue rendent le même état de formulaire, et c'est ce chemin-là
    // que l'éditeur voit dans les deux cas.
    const soumissionIllisible = updateFormData([])
    soumissionIllisible.set("price", "abc")
    const refusDeChamp = await updateProductAction({}, soumissionIllisible)
    expect(Object.keys(refusDeChamp)).toEqual(Object.keys(resultat))
    expect(refusDeChamp).toEqual({ error: "Formulaire invalide" })
  })
})
