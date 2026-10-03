import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const {
  sendMock,
  signedUrlMock,
  putCommandInputs,
  copyCommandInputs,
  deleteCommandInputs,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  signedUrlMock: vi.fn(),
  putCommandInputs: [] as unknown[],
  copyCommandInputs: [] as unknown[],
  deleteCommandInputs: [] as unknown[],
}))

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(command: unknown) {
      return sendMock(command)
    }
  }

  class MockPutObjectCommand {
    readonly input: unknown
    constructor(input: unknown) {
      this.input = input
      putCommandInputs.push(input)
    }
  }

  class MockCopyObjectCommand {
    readonly input: unknown
    constructor(input: unknown) {
      this.input = input
      copyCommandInputs.push(input)
    }
  }

  class MockDeleteObjectCommand {
    readonly input: unknown
    constructor(input: unknown) {
      this.input = input
      deleteCommandInputs.push(input)
    }
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    CopyObjectCommand: MockCopyObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
  }
})

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: signedUrlMock,
}))

import {
  DUREE_VIE_URL_ENVOI_PRESIGNEE_S,
  MAX_UPLOAD_SIZE,
  objectKeyFromPublicUrl,
  publicUrlFromKey,
  stockageImageProduitR2,
} from "@/lib/r2"

const ENV_R2 = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const

const envInitial = new Map(ENV_R2.map((key) => [key, process.env[key]]))

afterAll(() => {
  for (const key of ENV_R2) {
    const value = envInitial.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(() => {
  for (const key of ENV_R2) delete process.env[key]
  process.env.R2_ACCOUNT_ID = "account"
  process.env.R2_ACCESS_KEY_ID = "access"
  process.env.R2_SECRET_ACCESS_KEY = "secret"
  process.env.R2_BUCKET = "bucket"
  process.env.R2_PUBLIC_URL = "https://cdn.example.test/"
  ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
  sendMock.mockReset()
  signedUrlMock.mockReset()
  putCommandInputs.length = 0
  copyCommandInputs.length = 0
  deleteCommandInputs.length = 0
  sendMock.mockResolvedValue(undefined)
  signedUrlMock.mockResolvedValue("https://upload.example.test/signed")
})

/**
 * L'adaptateur R2 des Images produit, et lui seul.
 *
 * Ce qui reste ici est ce qu'aucun contrat ne peut dire à la place de cet
 * adaptateur : ce qu'il confie au SDK — la commande, son bucket, sa clé, sa
 * durée de signature —, les constantes qu'il exporte, et le message qu'il
 * compose quand le stockage meurt.
 *
 * Tout ce qui est une **règle du stockage** n'est plus ici. La disposition des
 * clés, la frontière d'espace de noms, les codes de refus, et l'accord « les six
 * opérations répondent et lever serait la divergence » appartiennent à
 * `test/contrat-stockage-image-produit.ts`, qui rejoue cet adaptateur côte à
 * côte avec la fiction en mémoire et épingle ce qui doit être vrai
 * indépendamment des deux. Les redire ici les dirait deux fois, en deux
 * vocabulaires : celui du port et celui du SDK.
 */
describe("adaptateur R2 des Images produit", () => {
  it("génère l'URL publique et dérive la clé depuis cette URL", () => {
    // La conversion elle-même, et non le verdict du port. `objectKeyFromPublicUrl`
    // n'est le port de personne : c'est une fonction exportée du module, que le
    // contrat appelle pour ramener une adresse à sa clé, que l'adaptateur en
    // mémoire appelle pour relire une suppression par URL, et que ce `null` —
    // une adresse d'une autre base n'a pas de clé ici — ne dit encore rien tant
    // qu'aucun appelant ne l'a transformée en refus. C'est cette transformation
    // que le contrat épingle, pas la conversion.
    const key = "products/image-1.webp"
    const url = publicUrlFromKey(key, "https://cdn.example.test/")

    expect(url).toBe("https://cdn.example.test/products/image-1.webp")
    expect(objectKeyFromPublicUrl(url!, "https://cdn.example.test")).toBe(key)
    expect(
      objectKeyFromPublicUrl(
        "https://cdn.example.test/products/image%20with%20space.webp",
        "https://cdn.example.test"
      )
    ).toBe("products/image with space.webp")
    expect(
      objectKeyFromPublicUrl(
        "https://other.example.test/products/image-1.webp",
        "https://cdn.example.test"
      )
    ).toBeNull()
  })

  it("pré-signe un Brouillon et ne renvoie pas sa clé", async () => {
    const resultat = await stockageImageProduitR2.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/jpeg",
      size: 42,
    })

    // La commande que le SDK a reçue est de l'adaptateur : le port ne rend pas
    // la commande, et rien au-dessus de lui ne la verra. La disposition de la
    // clé, elle, est épinglée par le contrat pour chaque type autorisé, à
    // partir de la disposition d'ADR-0004 et non d'une liste recopiée ici.
    expect(putCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.jpg",
      ContentType: "image/jpeg",
      ContentLength: 42,
    })
    // L'adresse d'envoi n'est pas dérivable d'une URL, et le contrat la laisse
    // hors de la comparaison : deux signataires n'ont pas à se ressembler. Sa
    // valeur vient donc du signataire, et c'est ici que cela se voit.
    expect(resultat).toMatchObject({
      ok: true,
      valeur: { uploadUrl: "https://upload.example.test/signed" },
    })
    // Le fait que le contrat ne peut pas prouver, et qu'il délègue
    // explicitement à cette suite : le client ne reçoit aucune clé, et il ne
    // peut donc pas en composer une adresse de bucket de sa propre initiative.
    expect(JSON.stringify(resultat)).not.toContain("Key")
  })

  it("pré-signe pour la durée de vie exportée, seule durée que la rétention doit surpasser", async () => {
    // La constante n'est utile que si elle est celle que l'appelant reçoit
    // réellement : la comparaison avec la rétention, vérifiée dans
    // `lib/cycle-vie-image-produit-retention.test.ts`, ne vaudrait rien si
    // l'adaptateur pouvait en garder une autre.
    await stockageImageProduitR2.presignerBrouillon({
      draftId: "draft-1",
      contentType: "image/jpeg",
      size: 42,
    })

    expect(signedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: DUREE_VIE_URL_ENVOI_PRESIGNEE_S }
    )
  })

  it("promouvoit en copiant la source vers la destination, et n'en rend que l'adresse", async () => {
    await stockageImageProduitR2.promouvoirBrouillon({
      draftId: "draft-1",
      contentType: "image/png",
    })

    // La promotion est une copie : c'est donc une `CopyObjectCommand`, et son
    // `CopySource` qui dit quelle clé a été lue. Le contrat épingle la clé
    // écrite pour chaque type autorisé ; ce que le port ne dit pas, et que
    // seule cette suite voit, c'est que la promotion ne réécrit rien et ne
    // recopie pas depuis elle-même.
    expect(copyCommandInputs).toHaveLength(1)
    expect(copyCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/draft-1.png",
      CopySource: encodeURIComponent("bucket/products/brouillons/draft-1.png"),
    })
  })

  it("supprime un Brouillon et une Image persistée sans exposer de clé au client", async () => {
    const brouillon = await stockageImageProduitR2.supprimerBrouillon({
      draftId: "draft-1",
      contentType: "image/gif",
    })
    const persistee = await stockageImageProduitR2.supprimerImagePersistee(
      "https://cdn.example.test/products/image-1.gif"
    )

    // Le port rend `null` et rien d'autre : le nom de l'objet supprimé ne sert
    // à rien à un éditeur, et le lui rendre serait lui donner une adresse de
    // bucket. Les clés, elles, vont au bucket — et c'est la seule chose que le
    // SDK reçoive.
    expect(brouillon).toEqual({ ok: true, valeur: null })
    expect(persistee).toEqual({ ok: true, valeur: null })
    expect(deleteCommandInputs[0]).toMatchObject({
      Bucket: "bucket",
      Key: "products/brouillons/draft-1.gif",
    })
    expect(deleteCommandInputs[1]).toMatchObject({
      Bucket: "bucket",
      Key: "products/image-1.gif",
    })
    expect(deleteCommandInputs).toHaveLength(2)
  })

  it("compose le message d'échec que le contrat ne compare pas", async () => {
    // Le contrat ramène une réponse à son code et laisse le message de côté :
    // le message est le vocabulaire de l'adaptateur, et le module propriétaire
    // compose le sien à partir du code. Ce texte est donc le dernier lieu où il
    // est vérifié, et il doit l'être — c'est lui qui atteinte un journal si le
    // module propriétaire cessait un jour de composer le sien. Les deux codes
    // qu'il accompagne ne sont pas re-énoncés ici : le contrat les épingle, et
    // rejoue cet adaptateur pour voir que les six opérations les rendent.
    sendMock.mockRejectedValue(new Error("secret AWS failure"))

    expect(
      await stockageImageProduitR2.promouvoirBrouillon({
        draftId: "draft-1",
        contentType: "image/avif",
      })
    ).toMatchObject({
      erreur: { message: "Échec de l'opération de stockage Cloudflare R2" },
    })

    for (const key of ENV_R2) delete process.env[key]
    expect(
      await stockageImageProduitR2.supprimerBrouillon({
        draftId: "draft-1",
        contentType: "image/avif",
      })
    ).toMatchObject({
      erreur: { message: "Stockage Cloudflare R2 non configuré" },
    })
  })

  it("conserve la limite de taille existante", () => {
    // La limite elle-même n'est pas réécrite par le contrat : il compare deux
    // réponses à une taille nulle et à une taille au-delà de `MAX_UPLOAD_SIZE`,
    // mais il ne pins pas le nombre, qui est un fait du module. Le cycle de vie,
    // lui, a la sienne et la refuse avant d'atteindre le port — les deux
    // bornes sont donc à dire, et celle-ci n'a pas d'autre suite.
    expect(MAX_UPLOAD_SIZE).toBe(10 * 1024 * 1024)
  })

  it("n'envoie au bucket que la clé d'une adresse acceptée, et rien pour une adresse refusée", async () => {
    // Le verdict — cette adresse est-elle dans l'espace de noms de l'opération
    // ? — est une règle du port, et le contrat l'énonce dans les deux sens.
    // Ce qu'aucune suite d'accord ne peut dire est ce que l'adaptateur a fait
    // de ce verdict : une adresse refusée qui atteindrait quand même le bucket
    // serait un objet supprimé sans que personne ne l'ait demandé, et le refus
    // mentirait sur ce qu'il a Abstenu de faire.
    for (const url of [
      "https://cdn.example.test/categories/2026/vintage.jpg",
      "https://cdn.example.test/banners/accueil.png",
      "https://cdn.example.test/products/brouillons/interdits.jpg",
    ]) {
      await stockageImageProduitR2.supprimerImageCategorie(url)
    }

    expect(
      deleteCommandInputs.map((input) => (input as { Key: string }).Key)
    ).toEqual(["categories/2026/vintage.jpg", "banners/accueil.png"])
  })
})
