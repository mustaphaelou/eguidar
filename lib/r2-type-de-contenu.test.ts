import { describe, expect, expectTypeOf, it } from "vitest"

import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  draftObjectKey,
  type ContentTypeImageProduit,
  type PortStockageImageProduit,
} from "@/lib/r2"
import { creerStockageImageProduitMemoire } from "@/test/cycle-vie-image-produit-memoire"

/** L'entrée d'une opération du port, nommée une fois pour toutes. */
type Entree<Operation extends keyof PortStockageImageProduit> = Parameters<
  PortStockageImageProduit[Operation]
>[0]

/**
 * Le type de contenu que le port déclare pour l'une des quatre opérations qui
 * en prennent un. Les deux suppressions par URL ne le prennent pas et n'ont donc
 * rien à déclarer : elles n'instancient pas ce type.
 */
type ContentTypeDeclare<Operation extends keyof PortStockageImageProduit> =
  Entree<Operation> extends { contentType: infer TypeDeContenu }
    ? TypeDeContenu
    : never

describe("type de contenu déclaré par le port de stockage", () => {
  it("continue d'exporter la liste dont il est l'union", () => {
    // Le type du port est tiré de cette liste : une liste disparue laisserait
    // un type sans source, et une liste vidée passerait le vérificateur de
    // types sans rien dire. Le compte est donc lu — c'est lui qui nomme les
    // « cinq types autorisés » dont l'union est le sujet, et un sixième type
    // doit faire réviser cette ligne à la main plutôt que disparaître en
    // silence.
    expect(CONTENT_TYPES_IMAGE_PRODUIT).toHaveLength(5)
  })

  it("déclare l'union des types autorisés pour les quatre opérations qui en prennent un", () => {
    // Ces quatre lignes sont le cœur du travail : le port déclarait `string`,
    // donc une valeur que l'implémentation refuse. Chacune est un verrou de
    // compilation — si le port s'élargit de nouveau, `npm run typecheck`, un
    // check de la CI, échoue. C'est lui qui tient la garantie, pas cette suite,
    // qui ne peut rien observer d'un appel qu'un appelant ne peut plus écrire.
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
    // Ce que l'éditeur ou une route transmet est du texte ; ce que le port
    // reçoit ne peut pas en être. La valeur ci-dessous est donc une chaîne,
    // et les quatre appels qui la passent ne doivent pas compiler.
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

    // Les quatre appels ont bien eu lieu : à l'exécution, la valeur passe et
    // rien ne la refuse. L'implémentation, elle, refusait depuis toujours le
    // reste — c'est le port qui l'admettait. Le compilateur est désormais ce
    // qui arrête l'appelant, et ces lignes vivent dans du code exécuté pour
    // qu'un refactoring ne puisse pas les emporter sans que `tsc --noEmit` ne
    // le dise.
    expect(stockage.presignatures).toEqual([
      { draftId: "draft-1", contentType: "image/png", size: 1 },
    ])
    expect(stockage.suppressionsBrouillons).toEqual(["draft-1"])
    expect(stockage.promotions).toEqual([
      { draftId: "draft-1", publicUrl: "memoire://image/draft-1" },
    ])
    expect(stockage.suppressionsImagesPromues).toEqual(["draft-1"])
  })

  it("continue de refuser à l'exécution de dériver une clé d'un type non autorisé", () => {
    // C'est de ce refus que le type du port est né : la dérivation de clé le
    // fait depuis toujours, et elle le fait par une exception — celle que les
    // quatre opérations du port lisent pour en tirer un `parametre-invalide`.
    // Resserrer le port ne consisted donc pas à retirer le garde-fou : le laisser
    // disparaître ouvrirait une voie — dériver une clé sans extension — que
    // plus rien n'interroge.
    expect(() => draftObjectKey("draft-1", "image/svg+xml")).toThrow(
      "Type de fichier non pris en charge"
    )
  })
})
