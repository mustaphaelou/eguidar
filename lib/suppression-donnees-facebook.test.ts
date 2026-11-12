import { createHmac, randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { revalidatePath } from "next/cache"

import { TYPE_ENTITE_PAR_DECLENCHEUR } from "@/lib/automations/charge"
import { enregistrerEvenement } from "@/lib/automations/evenements"
import { prisma } from "@/lib/db"

import SuppressionDonneesPage from "@/app/(boutique)/suppression-donnees/page"
import { POST } from "@/app/api/facebook/suppression-donnees/route"

const SECRET_APPLICATION = "secret-application-facebook-t840"
const ORIGINE_DE_TEST = "https://boutique.eguidar.test"

const VILLE_DU_CLIENT = "Casablanca"
const ADRESSE_DU_CLIENT = "1 rue du Test"
const TELEPHONE_DU_CLIENT = "+212600000000"
const PRIX_DE_LA_LIGNE = 10000
const FRAIS_DE_LIVRAISON = 0
const TOTAL_A_PAYER = PRIX_DE_LA_LIGNE + FRAIS_DE_LIVRAISON

const LIGNE_DE_PANIER = {
  productName: "Produit de test",
  variantName: "Standard",
  quantity: 1,
  price: PRIX_DE_LA_LIGNE,
} as const

const runId = randomUUID().slice(0, 8)
const emailPrefix = `suppression-facebook-${runId}-`

// Les Événements d'automatisation n'ont pas de clé étrangère vers le Compte
// client : ils survivent à la suppression du Client et la suite les efface
// elle-même, y compris ceux des cas négatifs.
const evenementsSemes: string[] = []
const executionsSemees: string[] = []

type DonneesClient = {
  email: string
  userId: string
  accountRowId: string
  orderId: string
  orderItemId: string
  verificationId: string
  verificationEmailId: string
  verificationChangementEmailId: string
  ville: string
  adresse: string
  telephone: string
  total: number
  fraisLivraison: number
  totalAPayer: number
  lignes: Array<{
    productName: string
    variantName: string
    quantity: number
    price: number
  }>
}

type EvenementsCommande = {
  creeeId: string
  statutChangeeId: string
  executionId: string
}

function signer(
  charge: Record<string, unknown>,
  secret: string = SECRET_APPLICATION
): string {
  const chargeB64 = Buffer.from(JSON.stringify(charge)).toString("base64url")
  const signature = createHmac("sha256", secret)
    .update(chargeB64)
    .digest("base64url")
  return `${signature}.${chargeB64}`
}

function requete(signedRequest: string | null): Request {
  const corps =
    signedRequest === null
      ? ""
      : new URLSearchParams({ signed_request: signedRequest }).toString()

  return new Request(`${ORIGINE_DE_TEST}/api/facebook/suppression-donnees`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: corps,
  })
}

async function semerCompte(
  identifiantApplicatif: string,
  email = `${emailPrefix}${identifiantApplicatif}@test.ma`
) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name: "Client Facebook",
    },
  })

  const account = await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: identifiantApplicatif,
      providerId: "facebook",
      userId: user.id,
    },
  })

  return { email: user.email, userId: user.id, accountRowId: account.id }
}

async function semerClient(
  identifiantApplicatif: string,
  email = `${emailPrefix}${identifiantApplicatif}@test.ma`
): Promise<DonneesClient> {
  const compte = await semerCompte(identifiantApplicatif, email)
  const user = { id: compte.userId, email: compte.email }

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      cityName: VILLE_DU_CLIENT,
      address: ADRESSE_DU_CLIENT,
      phone: TELEPHONE_DU_CLIENT,
      total: PRIX_DE_LA_LIGNE,
      shippingFee: FRAIS_DE_LIVRAISON,
      totalPayable: TOTAL_A_PAYER,
      items: {
        create: [LIGNE_DE_PANIER],
      },
    },
    include: { items: true },
  })

  // Better Auth construit ses identifiants avec `toOTPIdentifier` :
  // `${type}-otp-${email}`, sans deux-points.
  const verification = await prisma.verification.create({
    data: {
      id: randomUUID(),
      identifier: `forget-password-otp-${user.email}`,
      value: "empreinte:0",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  })

  const verificationEmail = await prisma.verification.create({
    data: {
      id: randomUUID(),
      identifier: `email-verification-otp-${user.email}`,
      value: "empreinte:0",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  })

  const verificationChangementEmail = await prisma.verification.create({
    data: {
      id: randomUUID(),
      identifier: `change-email-otp-${user.email}-nouvelle-${runId}@test.ma`,
      value: "empreinte:0",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  })

  return {
    ...compte,
    orderId: order.id,
    orderItemId: order.items[0].id,
    verificationId: verification.id,
    verificationEmailId: verificationEmail.id,
    verificationChangementEmailId: verificationChangementEmail.id,
    ville: VILLE_DU_CLIENT,
    adresse: ADRESSE_DU_CLIENT,
    telephone: TELEPHONE_DU_CLIENT,
    total: PRIX_DE_LA_LIGNE,
    fraisLivraison: FRAIS_DE_LIVRAISON,
    totalAPayer: TOTAL_A_PAYER,
    lignes: [{ ...LIGNE_DE_PANIER }],
  }
}

async function semerClientSansCommande(identifiantApplicatif: string) {
  return semerCompte(identifiantApplicatif)
}

/**
 * Sème les deux Événements de la Commande par l'écrivain réel : les charges
 * passent donc par les schémas de `CHARGES_PAR_DECLENCHEUR` et portent la copie
 * des données du Client. Une Exécution est rattachée au premier.
 */
async function semerEvenementsDeCommande(
  donnees: DonneesClient
): Promise<EvenementsCommande> {
  const copieDeLaCommande = {
    userEmail: donnees.email,
    orderId: donnees.orderId,
    items: donnees.lignes,
    total: donnees.total,
    shippingFee: donnees.fraisLivraison,
    totalPayable: donnees.totalAPayer,
    cityName: donnees.ville,
    address: donnees.adresse,
    phone: donnees.telephone,
  }

  const [creee, statutChangee] = await prisma.$transaction(async (tx) => {
    const creee = await enregistrerEvenement(tx, {
      type: "commande.creee",
      entityType: TYPE_ENTITE_PAR_DECLENCHEUR["commande.creee"],
      entityId: donnees.orderId,
      payload: { snapshot: copieDeLaCommande },
    })

    const statutChangee = await enregistrerEvenement(tx, {
      type: "commande.statut.changee",
      entityType: TYPE_ENTITE_PAR_DECLENCHEUR["commande.statut.changee"],
      entityId: donnees.orderId,
      payload: { snapshot: copieDeLaCommande, statut: "confirmed" },
    })

    return [creee, statutChangee]
  })

  evenementsSemes.push(creee.id, statutChangee.id)

  const execution = await prisma.automationRun.create({
    data: {
      eventId: creee.id,
      action: "envoyer-email-commande",
      status: "reussi",
      finishedAt: new Date(),
    },
  })
  executionsSemees.push(execution.id)

  return {
    creeeId: creee.id,
    statutChangeeId: statutChangee.id,
    executionId: execution.id,
  }
}

async function evenementsDeCommande(donnees: DonneesClient) {
  return prisma.automationEvent.findMany({
    where: { entityId: donnees.orderId },
    orderBy: { seq: "asc" },
  })
}

async function lignesRestantes(donnees: DonneesClient) {
  const [
    user,
    account,
    order,
    orderItem,
    verification,
    verificationEmail,
    verificationChangementEmail,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: donnees.userId } }),
    prisma.account.findUnique({ where: { id: donnees.accountRowId } }),
    prisma.order.findUnique({ where: { id: donnees.orderId } }),
    prisma.orderItem.findUnique({ where: { id: donnees.orderItemId } }),
    prisma.verification.findUnique({ where: { id: donnees.verificationId } }),
    prisma.verification.findUnique({
      where: { id: donnees.verificationEmailId },
    }),
    prisma.verification.findUnique({
      where: { id: donnees.verificationChangementEmailId },
    }),
  ])

  return {
    user,
    account,
    order,
    orderItem,
    verification,
    verificationEmail,
    verificationChangementEmail,
  }
}

beforeEach(() => {
  vi.stubEnv("FACEBOOK_CLIENT_SECRET", SECRET_APPLICATION)
  vi.stubEnv("BETTER_AUTH_URL", ORIGINE_DE_TEST)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(async () => {
  // Les Événements d'automatisation n'ont pas de clé étrangère vers le Compte
  // client : la suppression du Client ne les emporte pas. Le nettoyage les
  // efface par identifiant semé et balaie aussi toute charge qui porterait
  // encore l'adresse de la suite — ceux des cas négatifs compris.
  const evenementsRestants = await prisma.automationEvent.findMany({
    select: { id: true, payload: true },
  })
  const evenementsPortantLAdresse = evenementsRestants
    .filter(({ payload }) => JSON.stringify(payload).includes(emailPrefix))
    .map(({ id }) => id)

  await prisma.automationRun.deleteMany({
    where: { id: { in: executionsSemees } },
  })
  await prisma.automationEvent.deleteMany({
    where: {
      id: {
        in: [...new Set([...evenementsSemes, ...evenementsPortantLAdresse])],
      },
    },
  })
  await prisma.verification.deleteMany({
    where: { identifier: { contains: emailPrefix } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { contains: emailPrefix } } },
  })
  await prisma.user.deleteMany({
    where: { email: { contains: emailPrefix } },
  })
  vi.unstubAllEnvs()
})

describe("POST /api/facebook/suppression-donnees", () => {
  it("supprime le Compte client, son compte Facebook et ses Commandes quand la signature est valide", async () => {
    const identifiantApplicatif = `identifiant-${runId}-a`
    const donnees = await semerClient(identifiantApplicatif)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    const corps = await reponse.json()
    expect(corps).toEqual({
      url: expect.any(String),
      confirmation_code: expect.stringMatching(/^[0-9a-f]{32}$/),
    })
    expect(corps.url).toBe(
      `${ORIGINE_DE_TEST}/suppression-donnees?code=${corps.confirmation_code}`
    )

    await expect(lignesRestantes(donnees)).resolves.toEqual({
      user: null,
      account: null,
      order: null,
      orderItem: null,
      verification: null,
      verificationEmail: null,
      verificationChangementEmail: null,
    })
    expect(revalidatePath).toHaveBeenCalledWith("/commandes")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/commandes")
  })

  it("efface les Événements d'automatisation des Commandes supprimées", async () => {
    const identifiantApplicatif = `identifiant-${runId}-evenements`
    const donnees = await semerClient(identifiantApplicatif)
    const evenements = await semerEvenementsDeCommande(donnees)

    await expect(evenementsDeCommande(donnees)).resolves.toHaveLength(2)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    await expect(evenementsDeCommande(donnees)).resolves.toEqual([])
    await expect(
      prisma.automationEvent.findUnique({ where: { id: evenements.creeeId } })
    ).resolves.toBeNull()
    await expect(
      prisma.automationEvent.findUnique({
        where: { id: evenements.statutChangeeId },
      })
    ).resolves.toBeNull()
    await expect(lignesRestantes(donnees)).resolves.toEqual({
      user: null,
      account: null,
      order: null,
      orderItem: null,
      verification: null,
      verificationEmail: null,
      verificationChangementEmail: null,
    })
  })

  it("ne laisse aucune charge d'Événement porter les données de Commande du Client supprimé", async () => {
    const identifiantApplicatif = `identifiant-${runId}-charges`
    const donnees = await semerClient(identifiantApplicatif)
    await semerEvenementsDeCommande(donnees)

    // La ligne qui part emporte bien la ville, l'adresse, le téléphone, les
    // lignes du panier et les totaux : sans cela, l'assertion d'effacement ne
    // prouverait rien.
    const semes = await evenementsDeCommande(donnees)
    expect(semes).toHaveLength(2)
    for (const evenement of semes) {
      expect(evenement.payload).toMatchObject({
        snapshot: {
          userEmail: donnees.email,
          orderId: donnees.orderId,
          cityName: "Casablanca",
          address: "1 rue du Test",
          phone: "+212600000000",
          total: 10000,
          shippingFee: 0,
          totalPayable: 10000,
          items: [
            {
              productName: "Produit de test",
              variantName: "Standard",
              quantity: 1,
              price: 10000,
            },
          ],
        },
      })
    }

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    const restants = await prisma.automationEvent.findMany()
    expect(
      restants.filter(({ payload }) =>
        JSON.stringify(payload).includes(donnees.email)
      )
    ).toEqual([])
  })

  it("conserve l'Exécution d'automatisation liée à l'Événement supprimé avec un lien nullifié", async () => {
    const identifiantApplicatif = `identifiant-${runId}-execution`
    const donnees = await semerClient(identifiantApplicatif)
    const { executionId } = await semerEvenementsDeCommande(donnees)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    await expect(
      prisma.automationRun.findUnique({ where: { id: executionId } })
    ).resolves.toMatchObject({
      id: executionId,
      eventId: null,
      status: "reussi",
    })
  })

  it("supprime un Client rattaché à Facebook mais sans Commande et rend le code de confirmation", async () => {
    const identifiantApplicatif = `identifiant-${runId}-sans-commande`
    const compte = await semerClientSansCommande(identifiantApplicatif)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    const corps = await reponse.json()
    expect(corps).toEqual({
      url: expect.any(String),
      confirmation_code: expect.stringMatching(/^[0-9a-f]{32}$/),
    })
    expect(corps.url).toBe(
      `${ORIGINE_DE_TEST}/suppression-donnees?code=${corps.confirmation_code}`
    )
    await expect(
      prisma.user.findUnique({ where: { id: compte.userId } })
    ).resolves.toBeNull()
    await expect(
      prisma.account.findUnique({ where: { id: compte.accountRowId } })
    ).resolves.toBeNull()
  })

  it("efface les Événements du seul Client demandé quand deux Clients sont semés", async () => {
    const identifiantSupprime = `identifiant-${runId}-deux-a`
    const clientSupprime = await semerClient(identifiantSupprime)
    await semerEvenementsDeCommande(clientSupprime)

    const identifiantConserve = `identifiant-${runId}-deux-b`
    const clientConserve = await semerClient(identifiantConserve)
    const evenementsConserves = await semerEvenementsDeCommande(clientConserve)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantSupprime,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    await expect(evenementsDeCommande(clientSupprime)).resolves.toEqual([])
    await expect(evenementsDeCommande(clientConserve)).resolves.toEqual([
      expect.objectContaining({ id: evenementsConserves.creeeId }),
      expect.objectContaining({ id: evenementsConserves.statutChangeeId }),
    ])
    await expect(lignesRestantes(clientConserve)).resolves.toMatchObject({
      user: { id: clientConserve.userId },
      order: { id: clientConserve.orderId },
    })
  })

  it("rejoue la même demande signée sans effacer davantage", async () => {
    const identifiantApplicatif = `identifiant-${runId}-rejeu`
    const donnees = await semerClient(identifiantApplicatif)
    await semerEvenementsDeCommande(donnees)
    const demandeSignee = () =>
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )

    const premiere = await POST(demandeSignee())

    expect(premiere.status).toBe(200)
    await expect(evenementsDeCommande(donnees)).resolves.toEqual([])
    const nombreApresPremiere = await prisma.automationEvent.count()

    const seconde = await POST(demandeSignee())

    expect(seconde.status).toBe(200)
    await expect(seconde.json()).resolves.toEqual({
      url: expect.any(String),
      confirmation_code: expect.stringMatching(/^[0-9a-f]{32}$/),
    })
    await expect(prisma.automationEvent.count()).resolves.toBe(
      nombreApresPremiere
    )
    await expect(lignesRestantes(donnees)).resolves.toEqual({
      user: null,
      account: null,
      order: null,
      orderItem: null,
      verification: null,
      verificationEmail: null,
      verificationChangementEmail: null,
    })
  })

  it("supprime aussi le code de changement d'adresse dont l'ancienne adresse est celle du Client supprimé", async () => {
    const identifiantApplicatif = `identifiant-${runId}-changement-email`
    const donnees = await semerClient(identifiantApplicatif)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    await expect(lignesRestantes(donnees)).resolves.toEqual({
      user: null,
      account: null,
      order: null,
      orderItem: null,
      verification: null,
      verificationEmail: null,
      verificationChangementEmail: null,
    })
  })

  it("refuse une signature malformée qui décode pourtant les bons octets", async () => {
    const identifiantApplicatif = `identifiant-${runId}-malformee`
    const donnees = await semerClient(identifiantApplicatif)
    const evenements = await semerEvenementsDeCommande(donnees)
    const signe = signer({
      algorithm: "HMAC-SHA256",
      user_id: identifiantApplicatif,
      issued_at: 1700000000,
    })
    const malforme = `${signe.split(".")[0]}!###.${signe.split(".")[1]}`

    const reponse = await POST(requete(malforme))

    expect(reponse.status).toBe(403)
    await expect(lignesRestantes(donnees)).resolves.toMatchObject({
      user: { id: donnees.userId },
      order: { id: donnees.orderId },
      verification: { id: donnees.verificationId },
      verificationEmail: { id: donnees.verificationEmailId },
      verificationChangementEmail: {
        id: donnees.verificationChangementEmailId,
      },
    })
    await expect(evenementsDeCommande(donnees)).resolves.toEqual([
      expect.objectContaining({ id: evenements.creeeId }),
      expect.objectContaining({ id: evenements.statutChangeeId }),
    ])
  })

  it("refuse une signature invalide et ne supprime rien", async () => {
    const identifiantApplicatif = `identifiant-${runId}-b`
    const donnees = await semerClient(identifiantApplicatif)
    const evenements = await semerEvenementsDeCommande(donnees)

    const reponse = await POST(
      requete(
        signer(
          {
            algorithm: "HMAC-SHA256",
            user_id: identifiantApplicatif,
            issued_at: 1700000000,
          },
          "mauvais-secret"
        )
      )
    )

    expect(reponse.status).toBe(403)
    await expect(reponse.json()).resolves.toEqual({
      error: expect.any(String),
    })

    const restantes = await lignesRestantes(donnees)
    expect(restantes.user).not.toBeNull()
    expect(restantes.account).not.toBeNull()
    expect(restantes.order).not.toBeNull()
    expect(restantes.orderItem).not.toBeNull()
    expect(restantes.verification).not.toBeNull()
    expect(restantes.verificationEmail).not.toBeNull()
    expect(restantes.verificationChangementEmail).not.toBeNull()
    await expect(evenementsDeCommande(donnees)).resolves.toEqual([
      expect.objectContaining({ id: evenements.creeeId }),
      expect.objectContaining({ id: evenements.statutChangeeId }),
    ])
  })

  it("refuse une requête sans signed_request et ne supprime rien", async () => {
    const donnees = await semerClient(`identifiant-${runId}-c`)
    const evenements = await semerEvenementsDeCommande(donnees)

    const reponse = await POST(requete(null))

    expect(reponse.status).toBe(403)
    await expect(reponse.json()).resolves.toEqual({
      error: expect.any(String),
    })

    const restantes = await lignesRestantes(donnees)
    expect(restantes.user).not.toBeNull()
    expect(restantes.account).not.toBeNull()
    expect(restantes.order).not.toBeNull()
    expect(restantes.orderItem).not.toBeNull()
    expect(restantes.verification).not.toBeNull()
    expect(restantes.verificationEmail).not.toBeNull()
    expect(restantes.verificationChangementEmail).not.toBeNull()
    await expect(evenementsDeCommande(donnees)).resolves.toEqual([
      expect.objectContaining({ id: evenements.creeeId }),
      expect.objectContaining({ id: evenements.statutChangeeId }),
    ])
  })

  it("ne supprime rien quand le secret de l'application manque", async () => {
    const identifiantApplicatif = `identifiant-${runId}-d`
    const donnees = await semerClient(identifiantApplicatif)
    const evenements = await semerEvenementsDeCommande(donnees)
    vi.stubEnv("FACEBOOK_CLIENT_SECRET", "")

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(500)
    await expect(reponse.json()).resolves.toEqual({
      error: expect.any(String),
    })

    const restantes = await lignesRestantes(donnees)
    expect(restantes.user).not.toBeNull()
    expect(restantes.account).not.toBeNull()
    expect(restantes.order).not.toBeNull()
    expect(restantes.orderItem).not.toBeNull()
    expect(restantes.verification).not.toBeNull()
    expect(restantes.verificationEmail).not.toBeNull()
    expect(restantes.verificationChangementEmail).not.toBeNull()
    await expect(evenementsDeCommande(donnees)).resolves.toEqual([
      expect.objectContaining({ id: evenements.creeeId }),
      expect.objectContaining({ id: evenements.statutChangeeId }),
    ])
  })

  it("accepte un identifiant Facebook inconnu et rend quand même un code de confirmation", async () => {
    const identifiantApplicatif = `identifiant-${runId}-inconnu`

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantApplicatif,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    const corps = await reponse.json()
    expect(corps).toEqual({
      url: expect.any(String),
      confirmation_code: expect.stringMatching(/^[0-9a-f]{32}$/),
    })
    expect(corps.url).toBe(
      `${ORIGINE_DE_TEST}/suppression-donnees?code=${corps.confirmation_code}`
    )
  })

  it("accepte aussi un corps JSON portant signed_request", async () => {
    const identifiantApplicatif = `identifiant-${runId}-json`
    const donnees = await semerClient(identifiantApplicatif)

    const reponse = await POST(
      new Request(`${ORIGINE_DE_TEST}/api/facebook/suppression-donnees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signed_request: signer({
            algorithm: "HMAC-SHA256",
            user_id: identifiantApplicatif,
            issued_at: 1700000000,
          }),
        }),
      })
    )

    expect(reponse.status).toBe(200)
    await expect(reponse.json()).resolves.toEqual({
      url: expect.any(String),
      confirmation_code: expect.stringMatching(/^[0-9a-f]{32}$/),
    })

    await expect(lignesRestantes(donnees)).resolves.toEqual({
      user: null,
      account: null,
      order: null,
      orderItem: null,
      verification: null,
      verificationEmail: null,
      verificationChangementEmail: null,
    })
  })

  it("ne supprime pas les codes d'un autre Compte client dont l'adresse a celle du Client supprimé pour suffixe", async () => {
    const identifiantSupprime = `identifiant-${runId}-suffixe-a`
    const clientSupprime = await semerClient(identifiantSupprime)
    const identifiantConserve = `identifiant-${runId}-suffixe-b`
    const clientConserve = await semerClient(
      identifiantConserve,
      `x${clientSupprime.email}`
    )

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: identifiantSupprime,
          issued_at: 1700000000,
        })
      )
    )

    expect(reponse.status).toBe(200)
    await expect(lignesRestantes(clientSupprime)).resolves.toEqual({
      user: null,
      account: null,
      order: null,
      orderItem: null,
      verification: null,
      verificationEmail: null,
      verificationChangementEmail: null,
    })

    const restantes = await lignesRestantes(clientConserve)
    expect(restantes.user).not.toBeNull()
    expect(restantes.verification).not.toBeNull()
    expect(restantes.verificationEmail).not.toBeNull()
    expect(restantes.verificationChangementEmail).not.toBeNull()
  })
})

describe("Page /suppression-donnees", () => {
  it("confirme la suppression et affiche le code de confirmation", async () => {
    const page = await SuppressionDonneesPage({
      searchParams: Promise.resolve({ code: "abc123def456" }),
    })
    const flux = await renderToReadableStream(page)
    const html = await new Response(flux).text()

    expect(html).toContain("abc123def456")
    expect(html).toContain("Suppression des données confirmée")
    expect(html).toContain("Commandes")
    expect(html).toContain("Si des données étaient rattachées")
  })

  it("n'affiche pas un code qui contient autre chose que des caractères alphanumériques", async () => {
    const page = await SuppressionDonneesPage({
      searchParams: Promise.resolve({ code: "abc-123" }),
    })
    const flux = await renderToReadableStream(page)
    const html = await new Response(flux).text()

    expect(html).not.toContain("abc-123")
    expect(html).toContain("Aucun code de confirmation")
  })
})
