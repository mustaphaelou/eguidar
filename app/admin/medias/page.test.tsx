import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

vi.mock("@/components/admin/medias-bibliotheque", () => ({
  MediasBibliotheque: (props: { params: unknown; page: unknown }) => (
    <div
      data-params={JSON.stringify(props.params)}
      data-page={JSON.stringify(props.page)}
    />
  ),
}))

import { prisma } from "@/lib/db"
import AdminMediasPage from "@/app/admin/medias/page"

const runId = randomUUID().slice(0, 8)
const PREFIXE_URL = `https://cdn.example.test/products/page-medias-${runId}-`
const PREFIXE_SLUG = `p-page-medias-${runId}-`

const url = (suffix: string) => `${PREFIXE_URL}${suffix}`
const UTILISEE = url("utilisee.webp")
const INUTILISEE = url("inutilisee.jpg")

async function creerProduit(nom: string, images: string[]) {
  return prisma.product.create({
    data: {
      name: nom,
      slug: `${PREFIXE_SLUG}${randomUUID().slice(0, 8)}`,
      description: "description",
      brand: "Marque",
      price: 10000,
      specs: {},
      images,
    },
    select: { id: true },
  })
}

function lireAttribut(html: string, nom: string): unknown {
  const trouve = html.match(new RegExp(`${nom}="([^"]*)"`))
  if (!trouve) throw new Error(`Attribut ${nom} absent du rendu`)
  return JSON.parse(
    trouve[1]!
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&amp;", "&")
  )
}

async function rendre(
  searchParams: Record<string, string | string[] | undefined>
): Promise<{ params: Record<string, unknown>; page: Record<string, unknown> }> {
  const stream = await renderToReadableStream(
    <AdminMediasPage searchParams={Promise.resolve(searchParams)} />
  )
  const html = await new Response(stream).text()
  return {
    params: lireAttribut(html, "data-params") as Record<string, unknown>,
    page: lireAttribut(html, "data-page") as Record<string, unknown>,
  }
}

beforeAll(async () => {
  await prisma.imageProduit.deleteMany()
  await prisma.product.deleteMany()
})

beforeEach(async () => {
  await prisma.imageProduit.deleteMany()
  await prisma.product.deleteMany()
  await creerProduit("Produit Alpha", [UTILISEE])
  await prisma.imageProduit.createMany({
    data: [
      {
        publicUrl: UTILISEE,
        mimeType: "image/webp",
        byteSize: 2048,
        width: 1200,
        height: 800,
        alt: "Écran du Produit Alpha",
      },
      {
        publicUrl: INUTILISEE,
        mimeType: "image/jpeg",
        byteSize: 0,
        width: 0,
        height: 0,
      },
    ],
  })
})

afterAll(async () => {
  await prisma.imageProduit.deleteMany()
  await prisma.product.deleteMany()
  await prisma.$disconnect()
})

describe("page des Médias", () => {
  it("lit le registre et transmet les comptes à la Bibliothèque", async () => {
    const { params, page } = await rendre({})

    expect(params).toEqual({})
    expect(page).toMatchObject({
      totalCount: 2,
      inutiliseesCount: 1,
      sansAltCount: 1,
    })
    const images = page.images as { publicUrl: string; usageCount: number }[]
    expect(images.map((image) => image.publicUrl).sort()).toEqual(
      [INUTILISEE, UTILISEE].sort()
    )
    expect(
      images.find((image) => image.publicUrl === UTILISEE)?.usageCount
    ).toBe(1)
  })

  it("applique la recherche et les filtres lus dans l'URL", async () => {
    const recherche = await rendre({ q: "alpha" })
    expect(recherche.params).toEqual({ q: "alpha" })
    expect(
      (recherche.page.images as { publicUrl: string }[]).map(
        (image) => image.publicUrl
      )
    ).toEqual([UTILISEE])

    const inutilisees = await rendre({ inutilisees: "1" })
    expect(inutilisees.params).toEqual({ inutilisees: true })
    expect(
      (inutilisees.page.images as { publicUrl: string }[]).map(
        (image) => image.publicUrl
      )
    ).toEqual([INUTILISEE])

    const sansAlt = await rendre({ "sans-alt": "1" })
    expect(sansAlt.params).toEqual({ sansAlt: true })
    expect(
      (sansAlt.page.images as { publicUrl: string }[]).map(
        (image) => image.publicUrl
      )
    ).toEqual([INUTILISEE])
  })
})
