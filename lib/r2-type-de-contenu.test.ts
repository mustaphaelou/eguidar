import { describe, expect, expectTypeOf, it } from "vitest"

import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  draftObjectKey,
  persistentObjectKey,
  type ContentTypeImageProduit,
  type PortStockageImageProduit,
} from "@/lib/r2"
import {
  creerStockageImageProduitMemoire,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

type Entree<Operation extends keyof PortStockageImageProduit> = Parameters<
  PortStockageImageProduit[Operation]
>[0]

type ContentTypeDeclare<Operation extends keyof PortStockageImageProduit> =
  Entree<Operation> extends { contentType: infer TypeDeContenu }
    ? TypeDeContenu
    : never

describe("type de contenu déclaré par le port de stockage", () => {
  it("continue d'exporter la liste dont il est l'union", () => {
    expect(CONTENT_TYPES_IMAGE_PRODUIT).toHaveLength(5)
  })

  it("déclare l'union des types autorisés pour les quatre opérations qui en prennent un", () => {
    expectTypeOf<
      ContentTypeDeclare<"presignerBrouillon">
    >().toEqualTypeOf<ContentTypeImageProduit>()
    expectTypeOf<
      ContentTypeDeclare<"supprimerBrouillon">
    >().toEqualTypeOf<ContentTypeImageProduit>()
    expectTypeOf<
      ContentTypeDeclare<"promouvoirBrouillon">
    >().toEqualTypeOf<ContentTypeImageProduit>()
    expectTypeOf<
      ContentTypeDeclare<"supprimerImagePromue">
    >().toEqualTypeOf<ContentTypeImageProduit>()
  })

  it("fait échouer la compilation d'un appelant qui ne fait que produire une chaîne", async () => {
    const contentType: string = "image/png"
    const draftId = "draft-1"
    const stockage = creerStockageImageProduitMemoire()

    // @ts-expect-error — le port prend l'union des types autorisés, pas une chaîne
    await stockage.presignerBrouillon({ draftId, contentType, size: 1 })
    // @ts-expect-error — le port prend l'union des types autorisés, pas une chaîne
    await stockage.supprimerBrouillon({ draftId, contentType })
    // @ts-expect-error — le port prend l'union des types autorisés, pas une chaîne
    await stockage.promouvoirBrouillon({ draftId, contentType })
    // @ts-expect-error — le port prend l'union des types autorisés, pas une chaîne
    await stockage.supprimerImagePromue({ draftId, contentType })

    expect(stockage.presignatures).toEqual([
      {
        draftId: "draft-1",
        contentType: "image/png",
        size: 1,
        cle: draftObjectKey("draft-1", "image/png"),
      },
    ])
    expect(stockage.suppressionsBrouillons).toEqual([
      draftObjectKey("draft-1", "image/png"),
    ])
    expect(stockage.promotions).toEqual([
      {
        draftId: "draft-1",
        cleSource: draftObjectKey("draft-1", "image/png"),
        cle: persistentObjectKey("draft-1", "image/png"),
        publicUrl: urlImagePersistee("draft-1", "image/png"),
      },
    ])
    expect(stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey("draft-1", "image/png"),
    ])
  })

  it("continue de refuser à l'exécution de dériver une clé d'un type non autorisé", () => {
    expect(() => draftObjectKey("draft-1", "image/svg+xml")).toThrow(
      "Type de fichier non pris en charge"
    )
  })
})
