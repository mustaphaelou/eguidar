import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/use-cases/session-courante")
  >()),
  lireSession: sessionCouranteMock,
}))

import { GET } from "@/app/api/admin/produits/importer/refus/[lotId]/route"
import { COLONNES_IMPORT } from "@/lib/import-produits"
import { prisma } from "@/lib/db"
import type { Client } from "@/lib/use-cases/session-courante"

const runId = randomUUID().slice(0, 8)
const AUTEUR_ID = `refus-route-auteur-${runId}`

const ADMIN: Client = {
  id: AUTEUR_ID,
  name: "Éditeur",
  email: `refus-route-${runId}@example.test`,
  role: "admin",
}

const MESSAGE_PRIX =
  "Le prix de la Variante n'est pas un montant valide : écrivez des dirhams avec un point décimal et deux décimales au plus, par exemple « 12.50 »."

function comme(role: Client["role"] | null) {
  sessionCouranteMock.mockResolvedValue(
    role === null ? null : { ...ADMIN, role }
  )
}

function requete(lotId: string): ReturnType<typeof GET> {
  return GET(new Request(`http://localhost/refus/${lotId}`), {
    params: Promise.resolve({ lotId }),
  })
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: AUTEUR_ID,
      name: ADMIN.name,
      email: ADMIN.email,
      role: "admin",
    },
  })
})

beforeEach(async () => {
  sessionCouranteMock.mockReset()
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
})

afterAll(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
  await prisma.user.deleteMany({ where: { id: AUTEUR_ID } })
  await prisma.$disconnect()
})

async function semerLeLotAvecRefus(): Promise<string> {
  const lot = await prisma.lotImport.create({
    data: {
      auteurId: AUTEUR_ID,
      empreinte: "a".repeat(64),
      taille: 120,
      statut: "verifie",
      lignes: {
        create: [
          {
            numero: 2,
            slug: "chaise",
            sku: "CHAISE-01",
            cellules: {
              slug: "chaise",
              name: 'Chaise, "grand"',
              variant_sku: "CHAISE-01",
              variant_price: "douze",
            },
            codeRefus: "prix_invalide",
            statut: "refusee",
          },
          {
            numero: 3,
            slug: "",
            sku: "",
            cellules: {},
            codeRefus: "ligne_mal_formee",
            statut: "refusee",
          },
          {
            numero: 4,
            slug: "table",
            sku: "TABLE-01",
            cellules: { slug: "table", variant_sku: "TABLE-01" },
            statut: "a_creer",
          },
        ],
      },
    },
  })
  return lot.id
}

describe("GET /api/admin/produits/importer/refus/[lotId]", () => {
  it("télécharge un CSV des refus relu depuis la base, une ligne par Ligne refusée", async () => {
    comme("admin")
    const lotId = await semerLeLotAvecRefus()

    const reponse = await requete(lotId)
    const octets = new Uint8Array(await reponse.arrayBuffer())
    const corps = new TextDecoder().decode(octets)
    const lignes = corps.split("\r\n")

    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(reponse.headers.get("Content-Disposition")).toBe(
      `attachment; filename="refus-import-${lotId}.csv"`
    )
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store")
    expect([...octets.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(lignes[0]).toBe(`numero,code,message,${COLONNES_IMPORT.join(",")}`)
    expect(lignes.filter(Boolean)).toHaveLength(3)
    expect(lignes[1]).toContain("2,prix_invalide,")
    expect(lignes[1]).toContain(MESSAGE_PRIX)
    expect(lignes[1]).toContain('chaise,"Chaise, ""grand"""')
    expect(lignes[1]).toContain("douze,")
    expect(lignes[2]).toContain("3,ligne_mal_formee,")
    expect(lignes[2]).toContain("enregistrement CSV valide")
    expect(corps).not.toContain("TABLE-01")
  })

  it("refuse un compte ordinaire sans rendre le fichier", async () => {
    comme("user")
    const lotId = await semerLeLotAvecRefus()

    const reponse = await requete(lotId)

    expect(reponse.status).toBe(401)
    await expect(reponse.text()).resolves.toBe("Non autorisé")
    expect(reponse.headers.get("Content-Disposition")).toBeNull()
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("refuse un visiteur sans session", async () => {
    comme(null)
    const lotId = await semerLeLotAvecRefus()

    const reponse = await requete(lotId)

    expect(reponse.status).toBe(401)
    expect(reponse.headers.get("Content-Disposition")).toBeNull()
  })

  it("répond 404 pour un Lot inconnu", async () => {
    comme("admin")

    const reponse = await requete("lot-inconnu")

    expect(reponse.status).toBe(404)
    await expect(reponse.text()).resolves.toBe(
      "Ce Lot d'import est introuvable."
    )
    expect(reponse.headers.get("Content-Disposition")).toBeNull()
  })
})
