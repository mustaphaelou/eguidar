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

import { prisma } from "@/lib/db"

import SuppressionDonneesPage from "@/app/(boutique)/suppression-donnees/page"
import { POST } from "@/app/api/facebook/suppression-donnees/route"

const SECRET_APPLICATION = "secret-application-facebook-t840"
const ORIGINE_DE_TEST = "https://boutique.eguidar.test"

const runId = randomUUID().slice(0, 8)
const emailPrefix = `suppression-facebook-${runId}-`

type DonneesClient = {
  userId: string
  accountRowId: string
  orderId: string
  orderItemId: string
  verificationId: string
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

async function semerClient(asid: string): Promise<DonneesClient> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${emailPrefix}${asid}@test.ma`,
      name: "Client Facebook",
    },
  })

  const account = await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: asid,
      providerId: "facebook",
      userId: user.id,
    },
  })

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      cityName: "Casablanca",
      address: "1 rue du Test",
      phone: "+212600000000",
      total: 10000,
      shippingFee: 0,
      totalPayable: 10000,
      items: {
        create: [
          {
            productName: "Produit de test",
            variantName: "Standard",
            price: 10000,
            quantity: 1,
          },
        ],
      },
    },
    include: { items: true },
  })

  const verification = await prisma.verification.create({
    data: {
      id: randomUUID(),
      identifier: `email-otp:forget-password:${user.email}`,
      value: "empreinte:0",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  })

  return {
    userId: user.id,
    accountRowId: account.id,
    orderId: order.id,
    orderItemId: order.items[0].id,
    verificationId: verification.id,
  }
}

async function lignesRestantes(donnees: DonneesClient) {
  const [user, account, order, orderItem, verification] = await Promise.all([
    prisma.user.findUnique({ where: { id: donnees.userId } }),
    prisma.account.findUnique({ where: { id: donnees.accountRowId } }),
    prisma.order.findUnique({ where: { id: donnees.orderId } }),
    prisma.orderItem.findUnique({ where: { id: donnees.orderItemId } }),
    prisma.verification.findUnique({ where: { id: donnees.verificationId } }),
  ])

  return { user, account, order, orderItem, verification }
}

beforeEach(() => {
  vi.stubEnv("FACEBOOK_CLIENT_SECRET", SECRET_APPLICATION)
  vi.stubEnv("BETTER_AUTH_URL", ORIGINE_DE_TEST)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await prisma.verification.deleteMany({
    where: { identifier: { contains: emailPrefix } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: emailPrefix } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  })
  vi.unstubAllEnvs()
})

describe("POST /api/facebook/suppression-donnees", () => {
  it("supprime le Compte client, son compte Facebook et ses Commandes quand la signature est valide", async () => {
    const asid = `asid-${runId}-a`
    const donnees = await semerClient(asid)

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: asid,
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
    })
    expect(revalidatePath).toHaveBeenCalledWith("/commandes")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/commandes")
  })

  it("refuse une signature malformée qui décode pourtant les bons octets", async () => {
    const asid = `asid-${runId}-malformee`
    const donnees = await semerClient(asid)
    const signe = signer({
      algorithm: "HMAC-SHA256",
      user_id: asid,
      issued_at: 1700000000,
    })
    const malforme = `${signe.split(".")[0]}!###.${signe.split(".")[1]}`

    const reponse = await POST(requete(malforme))

    expect(reponse.status).toBe(403)
    await expect(lignesRestantes(donnees)).resolves.toMatchObject({
      user: { id: donnees.userId },
      order: { id: donnees.orderId },
      verification: { id: donnees.verificationId },
    })
  })

  it("refuse une signature invalide et ne supprime rien", async () => {
    const asid = `asid-${runId}-b`
    const donnees = await semerClient(asid)

    const reponse = await POST(
      requete(
        signer(
          { algorithm: "HMAC-SHA256", user_id: asid, issued_at: 1700000000 },
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
  })

  it("refuse une requête sans signed_request et ne supprime rien", async () => {
    const donnees = await semerClient(`asid-${runId}-c`)

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
  })

  it("ne supprime rien quand le secret de l'application manque", async () => {
    const asid = `asid-${runId}-d`
    const donnees = await semerClient(asid)
    vi.stubEnv("FACEBOOK_CLIENT_SECRET", "")

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: asid,
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
  })

  it("accepte un identifiant Facebook inconnu et rend quand même un code de confirmation", async () => {
    const asid = `asid-${runId}-inconnu`

    const reponse = await POST(
      requete(
        signer({
          algorithm: "HMAC-SHA256",
          user_id: asid,
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
    const asid = `asid-${runId}-json`
    const donnees = await semerClient(asid)

    const reponse = await POST(
      new Request(`${ORIGINE_DE_TEST}/api/facebook/suppression-donnees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signed_request: signer({
            algorithm: "HMAC-SHA256",
            user_id: asid,
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
    })
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
})
