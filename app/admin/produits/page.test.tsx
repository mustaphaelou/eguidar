import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

vi.mock("@/components/admin/delete-product-button", () => ({
  DeleteProductButton: ({
    productId,
    productName,
  }: {
    productId: string
    productName: string
  }) => (
    <span
      data-testid="bouton-suppression"
      data-produit={productId}
      data-nom={productName}
    />
  ),
}))

import AdminProductsPage from "./page"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const NOM_DU_PRODUIT = `Produit de liste ${runId}`

async function rendreLaListe(): Promise<string> {
  const stream = await renderToReadableStream(<AdminProductsPage />)
  return new Response(stream).text()
}

function sansBalises(fragment: string): string {
  return fragment
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function texteDuStatut(html: string): string {
  const region = /<p[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/.exec(html)
  if (!region) throw new Error("région de statut absente")
  return sansBalises(region[1]!)
}

describe("AdminProductsPage — la grille étiquetée", () => {
  beforeAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `liste-admin-${runId}-` } },
    })
    await prisma.product.create({
      data: {
        name: NOM_DU_PRODUIT,
        slug: `liste-admin-${runId}-produit`,
        description: "Description de test",
        brand: "Marque",
        price: 100000,
        specs: {},
        images: [],
      },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `liste-admin-${runId}-` } },
    })
    await prisma.$disconnect()
  })

  it("affiche le Produit et annonce le total dans une région polie", async () => {
    const total = await prisma.product.count()
    const html = await rendreLaListe()

    expect(html).toContain(NOM_DU_PRODUIT)
    expect(html).toContain('aria-live="polite"')
    expect(texteDuStatut(html)).toBe(
      `${total} ${total > 1 ? "produits" : "produit"}`
    )
  })

  it("ne laisse aucun lien ni bouton sans nom accessible", async () => {
    const html = await rendreLaListe()

    for (const controle of html.matchAll(
      /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g
    )) {
      const nom = /aria-label="([^"]*)"/.exec(controle[2]!)?.[1]
      expect(nom || sansBalises(controle[3]!), controle[0]).toBeTruthy()
    }
  })
})
