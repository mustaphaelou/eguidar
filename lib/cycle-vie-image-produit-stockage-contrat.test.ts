import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it, vi } from "vitest"

const { sendMock, signedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  signedUrlMock: vi.fn(),
}))

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(command: unknown) {
      return sendMock(command)
    }
  }

  // Les trois commandes sont remplacées sans que le contrat n'en lise rien :
  // il ne connaît que le port, et le port ne rend pas la commande qu'il a
  // envoyée. Elles sont ici parce que le module de production les importe
  // nommément, et qu'un import manquant ferait échouer le chargement.
  class MockPutObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class MockCopyObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class MockDeleteObjectCommand {
    constructor(readonly input: unknown) {}
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

import { CONTENT_TYPES_IMAGE_PRODUIT, stockageImageProduitR2 } from "@/lib/r2"
import {
  CODES_ECHEC_CONTRAT,
  codesEchec,
  exigerEnteteStockage,
  exigerValeurEpingleeStockage,
  SCENARIOS_STOCKAGE,
  VALEURS_EPINGLEES,
  type AdaptateurStockage,
  type EtatStockageRejoue,
  type IdentiteStockage,
  type ReponseObservee,
  type ValeurEpingleeStockage,
} from "@/test/contrat-stockage-image-produit"
import {
  BASE_PUBLIQUE_MEMOIRE,
  creerStockageImageProduitMemoire,
  urlImagePersistee,
  type OperationStockage,
  type StockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

/**
 * La seule suite qui rejoue le contrat du Stockage d'Image produit, et le seul
 * point d'entrée de ce contrat.
 *
 * Elle est ici, à côté du contrat qu'elle rejoue, comme la suite du registre
 * l'est à côté du sien : le contrat est la spécification, la suite en est la
 * preuve, et aucun module de test n'est à la fois les deux.
 *
 * Ce qui lui est propre — et que la suite du registre n'a pas à avoir — est la
 * discipline de rejeu de l'adaptateur de production : le SDK de stockage est
 * simulé au niveau du module, les cinq variables d'environnement sont effacées
 * puis réamorcées, et le client mémorisé est remis à zéro.
 */
const ENV_R2 = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const

/**
 * La base publique du rejeu : celle de l'adaptateur en mémoire, réamorcée dans
 * `R2_PUBLIC_URL` pour que les deux adaptateurs adressent la même Image. C'est
 * la seule chose que le rejeu décide, et il la prend chez l'adaptateur qu'il ne
 * peut pas reconfigurer plutôt que de la déclarer à côté : une seconde base
 * écrite dans cette suite serait une valeur que personne ne relierait à
 * l'adaptateur qui l'utilise.
 *
 * Cette couture ne touche aucune base de données, et cette suite n'en ouvre
 * pas une : le `globalSetup` du projet s'exécutera quand même, comme pour
 * toute suite du dépôt, mais rien ici ne crée, ne nettoie ni ne relit une
 * rangée, et aucun `prisma.$disconnect` ne vient clore un après-midi de base
 * que cette suite n'a pas ouverte. C'est un fait revendiqué, pas un détail
 * passé sous silence.
 */
const basePublique = BASE_PUBLIQUE_MEMOIRE

const contentType = "image/webp" as const
const draftId = randomUUID()

const IDENTITE: IdentiteStockage = {
  draftId,
  contentType,
  basePublique,
  urlImagePersistee: urlImagePersistee(draftId, contentType),
  urlImageStructure: `${basePublique}/categories/2026/vintage.jpg`,
}

const envInitial = new Map(ENV_R2.map((key) => [key, process.env[key]]))

afterAll(() => {
  for (const key of ENV_R2) {
    const value = envInitial.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

/**
 * La discipline de rejeu, reprise telle quelle de la suite de l'adaptateur R2 et
 * déplacée du `beforeEach` sur le rejeu lui-même.
 *
 * Elle y était entre chaque test ; ici elle est entre chaque rejeu, parce qu'un
 * scénario change la configuration **au milieu** d'une comparaison : celui qui
 * demande un stockage non configuré efface les cinq variables, et le rejeu
 * suivant — celui de l'autre adaptateur, ou le scénario suivant — doit les
 * retrouver. Un reset par test laisserait les deux adaptateurs du même scénario
 * jouer dans deux configurations différentes, et le contrat comparerait des
 * réponses qui n'ont pas été produites dans les mêmes conditions.
 *
 * L'effacement précède le réamorçage parce que `.env` est chargé pour chaque
 * fichier de test et contient de vraies valeurs R2 : sans effacement, une
 * réamorçage partiel laisserait fuiter le bucket réel, et le scénario « non
 * configuré » ne verrait jamais son refus.
 *
 * Le `globalThis.r2` est la ligne qui compte, et la moins évidente.
 * `getR2Client` mémorise son client et ne le reconstruit jamais, et `globalThis`
 * n'appartient pas au graphe de modules : une suite qui ne remet pas le champ à
 * zéro ici reprend le client que la précédente a construit, avec les
 * identifiants de celle-ci. Cette ligne est aujourd'hui sans effet observable,
 * l'isolateur de Vitest donnant à chaque fichier son propre contexte ; elle est
 * mise quand même, parce que le jour où une suite rejouerait cet adaptateur dans
 * un contexte partagé, la faute serait invisible et le contrat faux. La suite
 * `admin-structure-image-stockage` porte la même ceinture deux fois, pour la
 * même raison : le dépôt sait déjà que ce partage est un risque, pas une
 * théorie.
 */
function reinitialiserRejeu(): void {
  for (const key of ENV_R2) delete process.env[key]
  process.env.R2_ACCOUNT_ID = "account"
  process.env.R2_ACCESS_KEY_ID = "access"
  process.env.R2_SECRET_ACCESS_KEY = "secret"
  process.env.R2_BUCKET = "bucket"
  process.env.R2_PUBLIC_URL = `${basePublique}/`
  ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
  sendMock.mockReset()
  signedUrlMock.mockReset()
  sendMock.mockResolvedValue(undefined)
  signedUrlMock.mockResolvedValue("https://upload.example.test/signed")
}

/**
 * L'incident que le rejeu demande, dans le langage du stockage réel : une
 * configuration absente, ou un R2 qui ne répond plus. Le texte de la panne n'a
 * rien à cacher — le contrat ne compare aucun message — donc il est dit ici
 * plutôt que dans un relevé de secrets que personne ne lit.
 */
function appliquerIncidentR2(etat: EtatStockageRejoue): void {
  if (etat === "non-configure") {
    for (const key of ENV_R2) delete process.env[key]
    return
  }
  if (etat === "mort") {
    sendMock.mockRejectedValue(new Error("R2 injoignable"))
    signedUrlMock.mockRejectedValue(new Error("R2 injoignable"))
  }
}

/** Le même incident, dans le langage de l'adaptateur en mémoire : par opération. */
function appliquerIncidentMemoire(
  stockage: StockageImageProduitMemoire,
  etat: EtatStockageRejoue
): void {
  if (etat === "sain") return
  const panne = etat === "mort" ? "erreur-stockage" : "non-configure"
  for (const operation of Object.keys(stockage.pannes) as OperationStockage[]) {
    stockage.pannes[operation].add(panne)
  }
}

/**
 * Le stockage réel, qui est la référence : Cloudflare R2 est la sémantique de
 * référence de cette couture, et c'est l'adaptateur en mémoire qui est jugé
 * contre lui. L'inverse exact du contrat du registre, où la base tranche.
 */
const stockageProduction: AdaptateurStockage = (etat) => {
  reinitialiserRejeu()
  appliquerIncidentR2(etat)
  return stockageImageProduitR2
}

const stockageMemoire: AdaptateurStockage = (etat) => {
  const stockage = creerStockageImageProduitMemoire()
  appliquerIncidentMemoire(stockage, etat)
  return stockage
}

/**
 * Les six opérations levées, comme le ferait une connexion perdue. C'est le seul
 * écart entre l'adaptateur du contrôle négatif et l'adaptateur sain : une
 * fabrication qui tient en une ligne se voit.
 */
function leverPartout(stockage: StockageImageProduitMemoire): void {
  for (const operation of Object.keys(stockage.pannes) as OperationStockage[]) {
    stockage.pannes[operation].add("leve")
  }
}

/**
 * Le scénario qu'un cas cherche par une phrase de son nom. Un nom qui change
 * casse le cas bruyamment, ce qui vaut mieux qu'un contrôle négatif qui
 * trouverait un scénario et ne jouerait plus rien.
 */
function trouver(fragmentDuNom: string) {
  return SCENARIOS_STOCKAGE.find((candidat) =>
    candidat.nom.includes(fragmentDuNom)
  )
}

const adaptateurs: readonly AdaptateurStockage[] = [
  stockageProduction,
  stockageMemoire,
]

describe("stockage des Images produit — contrat des deux adaptateurs", () => {
  it("le contrat atteint tous les échecs que le port sait exprimer, sur chaque adaptateur", async () => {
    // Témoin de non-vacuité : un contrat où les deux adaptateurs refuseraient
    // la même chose, ou ne refuseraient jamais, passerait aussi facilement
    // qu'un contrat juste. Le port déclare `CodeEchecStockage` ; on vérifie que
    // le contrat le couvre entier, et la liste attendue est un `Record` de ce
    // code — `tsc` refuse donc déjà qu'un code y manque, avant même que cette
    // suite le cherche dans les observations.
    //
    // **Chaque adaptateur est mesuré seul.** La raison que le rejeu se fasse
    // sur les deux était bonne — le témoin mesure le vocabulaire du port, pas
    // ce que deux adaptateurs s'accordent à taire ensemble — mais elle ne
    // survivait pas à sa propre objection : en ne rejouant que la référence, elle
    // laissait un code que la fiction cesse d'atteindre invisible à un témoin
    // dont le métier est le vocabulaire du port. Elle vérifie donc la même
    // égalité une fois par adaptateur, et chacune doit tenir seule : deux
    // adaptateurs qui perdent le même code au même endroit font échouer le
    // témoin deux fois.
    const atteintsParAdaptateur: string[][] = []
    for (const adaptateur of adaptateurs) {
      const atteints: string[] = []
      for (const scenario of SCENARIOS_STOCKAGE) {
        const [observation] = await exigerEnteteStockage(
          scenario,
          [adaptateur],
          IDENTITE
        )
        atteints.push(...codesEchec(observation))
      }
      atteintsParAdaptateur.push(atteints)
    }

    const attendus = Object.keys(CODES_ECHEC_CONTRAT).sort()
    for (const atteints of atteintsParAdaptateur) {
      expect([...new Set(atteints)].sort()).toEqual(attendus)
    }
  })

  it("le contrat aperçoit une divergence que deux suites d'adaptateur laisseraient passer", async () => {
    // Un adaptateur qui supprime sans demander son avis à personne, là où
    // l'espace réservé aux Brouillons l'interdit : c'est la divergence que le
    // port sait exprimer et que deux suites d'adaptateur, chacune avec ses
    // propres attentes, ne verraient jamais. On la fabrique le temps du cas, on
    // ne la commite pas — le contrat doit la voir échouer, sinon il ne prouve
    // rien.
    const faux: AdaptateurStockage = () => ({
      ...creerStockageImageProduitMemoire(),
      async supprimerImagePersistee() {
        return { ok: true, valeur: null }
      },
    })
    const scenario = trouver("espace réservé aux Brouillons depuis une Image")
    if (!scenario) {
      throw new Error("Le scénario de l'espace réservé doit exister")
    }

    // Le message est épinglé : une levée qui se serait échappée ferait
    // échouer ce cas de la même façon, pour la mauvaise raison — sans nommer
    // l'accord, le contrôle négatif accepterait une exception qui a contourné la
    // comparaison.
    await expect(
      exigerEnteteStockage(scenario, [stockageMemoire, faux], IDENTITE)
    ).rejects.toThrow("accord entre les adaptateurs")
  })

  it("le contrat aperçoit un adaptateur qui lève là où l'accord le dit répondre", async () => {
    // Le second cas du contrôle négatif, et il protège le scénario pour lequel
    // ce contrat existe.
    //
    // « Les six opérations répondent, et lever serait la divergence » ne
    // prouverait rien si la projection d'une levée était inatteignable : les
    // deux adaptateurs répondraient, le projeté serait le même des deux côtés,
    // et le scénario passerait quoi qu'il arrive à une exception.
    //
    // L'adaptateur en mémoire sait lever — il est écrit pour ça, c'est le mode
    // que le port ne sait pas exprimer et qu'il faut pouvoir voir apparaître —
    // donc aucun ajustement n'est nécessaire pour lui faire désobéir : il
    // suffit de le lui demander, et le contrat doit y voir une divergence, et
    // non un test rouge sur une pile d'erreurs qui dirait « quelque chose a
    // levé » sans dire qui.
    const levant: AdaptateurStockage = (etat) => {
      const stockage = creerStockageImageProduitMemoire()
      appliquerIncidentMemoire(stockage, etat)
      leverPartout(stockage)
      return stockage
    }
    const scenario = trouver("un stockage mort se répond")
    if (!scenario) {
      throw new Error(
        "Le scénario de l'accord sur la façon d'échouer doit exister"
      )
    }

    await expect(
      exigerEnteteStockage(scenario, [stockageMemoire, levant], IDENTITE)
    ).rejects.toThrow("accord entre les adaptateurs")
  })

  for (const scenario of SCENARIOS_STOCKAGE) {
    it(`les deux adaptateurs s'accordent : ${scenario.nom}`, async () => {
      await exigerEnteteStockage(scenario, adaptateurs, IDENTITE)
    })
  }
})

/**
 * La valeur attendue tient.
 *
 * Le même fichier que la couche d'accord, et pour la même raison : les valeurs
 * épinglées sont **une couche du contrat** du Stockage d'Image produit, pas une
 * suite de plus. Le contrat doit rester un lieu déclaré et un seul, et cette
 * couche sa projection y est écrite ; lui donner son propre fichier de preuve
 * aurait voulu dire deux endroits où les règles du stockage sont épinglées, donc
 * deux vérités à tenir — exactement ce que l'arrangement du registre refuse.
 *
 * Un seul adaptateur est rejoué, la référence : la comparaison des deux est
 * l'affaire du `describe` d'au-dessus, et rejouer les deux ici transformerait une
 * valeur attendue en un second accord.
 *
 * Et rien n'y lit un interne d'adaptateur : ni le tableau d'adresses, ni la carte
 * d'échecs, ni les enregistrements de la fiction en mémoire — qui en expose
 * précisément, et dont la relecture serait le chemin le plus court. Tout passe
 * par le port, sur des observations projetées ; les seuls faits lus ailleurs sont
 * la disposition des clés et la liste des types autorisés, qui sont publics parce
 * que le document que Cloudflare reçoit en dépend.
 */
describe("stockage des Images produit — valeurs épinglées", () => {
  /**
   * La valeur qu'un cas cherche par une phrase de son nom, comme pour les
   * scénarios d'accord : un nom qui change casse le cas bruyamment.
   */
  function trouverValeur(fragmentDuNom: string): ValeurEpingleeStockage {
    const valeur = VALEURS_EPINGLEES.find((candidate) =>
      candidate.nom.includes(fragmentDuNom)
    )
    if (!valeur) {
      throw new Error(
        `La valeur épinglée « ${fragmentDuNom} » doit exister dans le contrat`
      )
    }
    return valeur
  }

  it("épingle une clé propre à chaque type de contenu autorisé, et la liste entière", async () => {
    // Le témoin de non-vacuité de la couche de valeurs. Il ne s'agit pas ici de
    // vérifier que la dérivation est exacte — chaque type autorisé a déjà son cas
    // — mais qu'elle l'est **pour chacun d'eux**, et pas pour les premiers de la
    // liste seulement. Une projection qui n'aurait couvert que les cinq premiers
    // laisserait disparaître un sixième type sans que la dérivation soit en
    // cause.
    //
    // Les deux moitiés du témoin disent deux choses distinctes. L'égalité des
    // noms de clés avec la liste autorisée dit que le parcours est exhaustif —
    // et c'est constructif, puisque les deux côtés viennent de la liste. Le compte
    // des clés distinctes dit autre chose : il prouve que le parcours a produit
    // une clé par type, donc qu'un type qui se ferait voler l'extension d'un
    // autre se verrait, ce que l'égalité des noms ne dirait pas.
    const observation = (await exigerValeurEpingleeStockage(
      trouverValeur("la clé de l'objet d'un Brouillon"),
      stockageProduction,
      IDENTITE
    )) as Record<string, ReponseObservee>

    expect(Object.keys(observation)).toEqual([...CONTENT_TYPES_IMAGE_PRODUIT])
    const cles = Object.values(observation).map((reponse) =>
      "ok" in reponse && reponse.ok ? reponse.cle : null
    )
    expect(new Set(cles).size).toBe(CONTENT_TYPES_IMAGE_PRODUIT.length)
  })

  for (const valeur of VALEURS_EPINGLEES) {
    it(`la valeur attendue tient : ${valeur.nom}`, async () => {
      await exigerValeurEpingleeStockage(valeur, stockageProduction, IDENTITE)
    })
  }
})
