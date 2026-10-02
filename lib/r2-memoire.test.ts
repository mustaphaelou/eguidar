import { describe, expect, it } from "vitest"

import {
  MAX_UPLOAD_SIZE,
  draftObjectKey,
  type CodeEchecStockage,
} from "@/lib/r2"
import {
  brouillon,
  creerCycleVieTest,
  creerStockageImageProduitMemoire,
  type OperationStockage,
  type StockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-01-15T10:00:00.000Z")

describe("adaptateur en mémoire du stockage des Images produit", () => {
  it("pré-signe un Brouillon sous la clé dérivée, et non sous une URL fabriquée", async () => {
    const stockage = creerStockageImageProduitMemoire()

    const resultat = await stockage.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/webp",
      size: 2048,
    })

    // Les valeurs sont épinglées, pas dérivées par la même route que
    // l'adaptateur : une assertion qui recalculerait l'attendu avec les mêmes
    // fonctions ne pourrait pas contredire le code.
    expect(resultat).toEqual({
      ok: true,
      valeur: {
        uploadUrl:
          "https://upload.example.test/products/brouillons/draft-1.webp",
        previewUrl: "https://cdn.example.test/products/brouillons/draft-1.webp",
      },
    })
    expect(stockage.presignatures).toEqual([
      {
        draftId: "draft-1",
        contentType: "image/webp",
        size: 2048,
        cle: "products/brouillons/draft-1.webp",
      },
    ])
  })

  it("promouvoit un Brouillon vers la clé persistante, et dit les deux clés qu'elle a visées", async () => {
    const stockage = creerStockageImageProduitMemoire()

    const resultat = await stockage.promouvoirBrouillon({
      draftId: "draft-1",
      contentType: "image/webp",
    })

    expect(resultat).toEqual({
      ok: true,
      valeur: { publicUrl: "https://cdn.example.test/products/draft-1.webp" },
    })
    // La promotion adresse deux clés : celle qu'elle copie et celle qu'elle
    // écrit. Le même identifiant, deux préfixes — c'est la promotion entière.
    expect(stockage.promotions).toEqual([
      {
        draftId: "draft-1",
        cleSource: "products/brouillons/draft-1.webp",
        cle: "products/draft-1.webp",
        publicUrl: "https://cdn.example.test/products/draft-1.webp",
      },
    ])
  })

  it("supprime un Brouillon sous sa clé, sous l'espace réservé, et non sous son identifiant", async () => {
    const stockage = creerStockageImageProduitMemoire()

    expect(
      await stockage.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).toEqual({ ok: true, valeur: null })
    expect(stockage.suppressionsBrouillons).toEqual([
      "products/brouillons/draft-1.webp",
    ])
  })

  it("supprime une Image promue sous la clé persistante, distincte de celle du Brouillon", async () => {
    const stockage = creerStockageImageProduitMemoire()

    expect(
      await stockage.supprimerImagePromue({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).toEqual({ ok: true, valeur: null })
    // Les deux suppressions par identifiant visent la même Image à deux
    // moments de sa vie. Enregistrer les clés plutôt que les identifiants,
    // c'est ce qui rend cette différence observable.
    expect(stockage.suppressionsImagesPromues).toEqual([
      "products/draft-1.webp",
    ])
  })

  it("relit dans les deux suppressions par URL la clé que l'URL publique nomme", async () => {
    const stockage = creerStockageImageProduitMemoire()

    expect(
      await stockage.supprimerImagePersistee(
        "https://cdn.example.test/products/image-1.webp"
      )
    ).toEqual({ ok: true, valeur: null })
    expect(
      await stockage.supprimerImageCategorie(
        "https://cdn.example.test/categories/2026/vintage.jpg"
      )
    ).toEqual({ ok: true, valeur: null })

    // L'aller-retour clé ⇄ URL est donc exécuté par une suite qui passe par le
    // port, et non plus seulement par celle qui appelle l'implémentation.
    expect(stockage.suppressionsImagesPersistees).toEqual([
      "products/image-1.webp",
    ])
    expect(stockage.suppressionsImagesCategorie).toEqual([
      "categories/2026/vintage.jpg",
    ])
  })

  it("garde les deux suppressions par URL hors de l'espace réservé des Brouillons", async () => {
    const stockage = creerStockageImageProduitMemoire()
    const BrouillonAbandonne =
      "https://cdn.example.test/products/brouillons/abandonne.webp"

    // Une Image produit persistée vit sous `products/`, une image de Structure
    // n'importe où sous la base publique : deux espaces de noms, deux gardes.
    // Ni l'une ni l'autre ne doit pouvoir viser le Brouillon abandonné, dont
    // l'expiration est le fait de la règle de cycle de vie R2.
    expect(
      await stockage.supprimerImageCategorie(
        "https://cdn.example.test/banners/accueil.png"
      )
    ).toEqual({ ok: true, valeur: null })
    for (const url of [
      BrouillonAbandonne,
      "https://cdn.example.test/categories/2026/vintage.jpg",
      "https://autre.example.test/products/image-1.webp",
    ]) {
      expect(await stockage.supprimerImagePersistee(url), url).toMatchObject({
        ok: false,
        erreur: { code: "parametre-invalide" },
      })
    }
    expect(
      await stockage.supprimerImageCategorie(BrouillonAbandonne)
    ).toMatchObject({ ok: false, erreur: { code: "parametre-invalide" } })

    // Un refus ne vise rien : ce qui n'a pas été adressé n'est pas enregistré.
    expect(stockage.suppressionsImagesPersistees).toEqual([])
    expect(stockage.suppressionsImagesCategorie).toEqual([
      "banners/accueil.png",
    ])
  })

  it("refuse en `parametre-invalide` ce dont aucune clé ne peut être dérivée", async () => {
    const stockage = creerStockageImageProduitMemoire()
    // Un identifiant qui porte un séparateur remonterait dans l'espace
    // réservé : la dérivation le refuse, comme elle le refuse en production,
    // et les six opérations lisent cette exception pour en faire un refus.
    const identifiantIsole = "brouillons/draft-1"

    for (const resultat of [
      await stockage.presignerBrouillon({
        draftId: identifiantIsole,
        contentType: "image/webp",
        size: 2048,
      }),
      await stockage.supprimerBrouillon({
        draftId: identifiantIsole,
        contentType: "image/webp",
      }),
      await stockage.promouvoirBrouillon({
        draftId: identifiantIsole,
        contentType: "image/webp",
      }),
      await stockage.supprimerImagePromue({
        draftId: identifiantIsole,
        contentType: "image/webp",
      }),
      // La limite de taille appartient au port : il refuse avant de dériver.
      await stockage.presignerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
        size: 0,
      }),
      await stockage.presignerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
        size: MAX_UPLOAD_SIZE + 1,
      }),
    ]) {
      expect(resultat).toMatchObject({
        ok: false,
        erreur: { code: "parametre-invalide" },
      })
    }
  })

  it("sait répondre chacun des trois codes du port, sur chacune des six opérations", async () => {
    // Une panne se décide opération par opération. Un mode global dirait
    // « plus rien ne marche » et laisserait une suite incapable de rejouer le
    // cas qui compte : une promotion qui réussit pendant qu'une suppression
    // échoue, ou l'inverse.
    const operations = [
      [
        "presignerBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.presignerBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
            size: 2048,
          }),
      ],
      [
        "supprimerBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.supprimerBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "promouvoirBrouillon",
        (s: StockageImageProduitMemoire) =>
          s.promouvoirBrouillon({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "supprimerImagePromue",
        (s: StockageImageProduitMemoire) =>
          s.supprimerImagePromue({
            draftId: "draft-1",
            contentType: "image/webp",
          }),
      ],
      [
        "supprimerImagePersistee",
        (s: StockageImageProduitMemoire) =>
          s.supprimerImagePersistee(
            "https://cdn.example.test/products/image-1.webp"
          ),
      ],
      [
        "supprimerImageCategorie",
        (s: StockageImageProduitMemoire) =>
          s.supprimerImageCategorie(
            "https://cdn.example.test/categories/vintage.jpg"
          ),
      ],
    ] as const satisfies readonly [
      OperationStockage,
      (s: StockageImageProduitMemoire) => Promise<unknown>,
    ][]
    // Un enregistrement, pas une liste : un quatrième code que le port
    // gagnerait à exprimer rendrait cette ligne fausse, et `tsc --noEmit` le
    // dirait. C'est le seul endroit où ce tableau gagnerait à la compilation.
    const codes = {
      "non-configure": "non-configure",
      "parametre-invalide": "parametre-invalide",
      "erreur-stockage": "erreur-stockage",
    } as const satisfies Record<CodeEchecStockage, CodeEchecStockage>

    for (const [operation, appeler] of operations) {
      for (const code of Object.values(codes)) {
        const stockage = creerStockageImageProduitMemoire()
        stockage.pannes[operation].add(code)
        expect(await appeler(stockage), `${operation}/${code}`).toMatchObject({
          ok: false,
          erreur: { code },
        })
      }
      // La même opération, sans panne, réussit : une panne se règle sur
      // l'opération et sur rien d'autre.
      expect(
        await appeler(creerStockageImageProduitMemoire()),
        operation
      ).toMatchObject({
        ok: true,
      })
    }
  })

  it("lève là où les trois indicateurs ne savent que répondre", async () => {
    // Le module propriétaire enveloppe le stockage dans deux `catch` qui
    // n'étaient atteignables par aucune suite : ni cet adaptateur ne levait,
    // ni l'adaptateur de production ne lève plus depuis qu'il répond
    // `erreur-stockage` sur les six opérations. Un mode qui lance est donc la
    // seule façon de donner un cas à la compensation.
    const stockage = creerStockageImageProduitMemoire()
    stockage.pannes.promouvoirBrouillon.add("leve")

    await expect(
      stockage.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      })
    ).rejects.toThrow("Stockage en mémoire indisponible : promouvoirBrouillon")

    // Les trois indicateurs booléens, eux, répondent : aucun des trois ne sait
    // produire une exception.
    const brouillard = creerStockageImageProduitMemoire()
    brouillard.failPresign = true
    brouillard.failPromotion = true
    brouillard.failDelete = true
    for (const resultat of [
      await brouillard.presignerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
        size: 2048,
      }),
      await brouillard.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      }),
      await brouillard.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/webp",
      }),
    ]) {
      expect(resultat).toMatchObject({
        ok: false,
        erreur: { code: "erreur-stockage" },
      })
    }
  })

  it("donne un cas aux deux rattrapages d'exception du module propriétaire", async () => {
    const enregistrement = creerCycleVieTest(DATE_INITIALE)
    const demande = await enregistrement.cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")
    enregistrement.stockage.pannes.supprimerBrouillon.add("leve")
    // Que la panne lève vraiment, et qu'elle ne soit pas une panne absente : le
    // rattrapage avalant les deux issues, une levée muette mesurerait un
    // best-effort qui n'a rien eu à rattraper.
    const preuve = creerStockageImageProduitMemoire()
    preuve.pannes.supprimerBrouillon.add("leve")
    await expect(
      preuve.supprimerBrouillon({
        draftId: demande.draftId,
        contentType: "image/webp",
      })
    ).rejects.toThrow("supprimerBrouillon")

    // La libération des sources est best-effort : une panne pendant qu'elle
    // supprime la copie du Brouillon ne remet pas l'enregistrement en cause,
    // parce que le commit du Catalogue est déjà écrit.
    expect(
      await enregistrement.cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(demande.draftId)],
        enregistrer: async (revendication) => {
          await revendication.lier("produit-1")
          return { productId: "produit-1" }
        },
      })
    ).toEqual({ ok: true, productId: "produit-1" })
    // L'adresse, elle, a bien été résolue avant que la suppression ne lève :
    // c'est ce qui distingue « n'a rien visé » de « a visé et n'a pas pu ».
    expect(enregistrement.stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(demande.draftId, "image/webp"),
    ])

    const compensation = creerCycleVieTest(DATE_INITIALE)
    const autreDemande = await compensation.cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/webp",
      size: 1024,
    })
    if (!autreDemande.ok) throw new Error("La demande devait réussir")
    compensation.stockage.pannes.supprimerImagePromue.add("leve")
    const preuveCompensation = creerStockageImageProduitMemoire()
    preuveCompensation.pannes.supprimerImagePromue.add("leve")
    await expect(
      preuveCompensation.supprimerImagePromue({
        draftId: autreDemande.draftId,
        contentType: "image/webp",
      })
    ).rejects.toThrow("supprimerImagePromue")

    expect(
      await compensation.cycleVie.revendiquerEtEnregistrer({
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
        galerie: [brouillon(autreDemande.draftId)],
        enregistrer: async () => {
          throw new Error("échec transactionnel")
        },
      })
    ).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(
      compensation.registre.records.get(autreDemande.draftId)
    ).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
  })
})
