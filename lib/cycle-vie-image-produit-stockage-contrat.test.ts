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

const ENV_R2 = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const

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

function leverPartout(stockage: StockageImageProduitMemoire): void {
  for (const operation of Object.keys(stockage.pannes) as OperationStockage[]) {
    stockage.pannes[operation].add("leve")
  }
}

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

    await expect(
      exigerEnteteStockage(scenario, [stockageMemoire, faux], IDENTITE)
    ).rejects.toThrow("accord entre les adaptateurs")
  })

  it("le contrat aperçoit un adaptateur qui lève là où l'accord le dit répondre", async () => {
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

describe("stockage des Images produit — valeurs épinglées", () => {
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
