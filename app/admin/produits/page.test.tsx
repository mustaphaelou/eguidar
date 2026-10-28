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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}))

import AdminProductsPage from "./page"
import { prisma } from "@/lib/db"
import {
  PRODUIT_STRUCTURE_SANS,
  PRODUIT_STOCK_ZERO,
} from "@/lib/produit-listing"
import { creerStructure, type StructureCreee } from "@/test/structure-fixtures"

const runId = randomUUID().slice(0, 8)
const prefixe = `route-produits-${runId}-`

let racine: StructureCreee
let enfant: StructureCreee
let autre: StructureCreee
let paginee: StructureCreee

interface ProduitCree {
  id: string
  nom: string
}

let chaise: ProduitCree
let table: ProduitCree
let bureau: ProduitCree
let orphelin: ProduitCree

async function creerProduit(
  cle: string,
  nom: string,
  categoryId: string | null,
  prix: number,
  options: { stocks?: number[]; creeLe?: string } = {}
): Promise<ProduitCree> {
  const produit = await prisma.product.create({
    data: {
      name: nom,
      slug: `${prefixe}${cle}`,
      description: "Description de test",
      brand: `Marque ${runId}`,
      categoryId,
      price: prix,
      specs: {},
      images: [],
      createdAt: options.creeLe ? new Date(options.creeLe) : undefined,
      variants: {
        create: (options.stocks ?? [1]).map((stock, index) => ({
          name: `Variante ${index + 1}`,
          sku: `SKU-${prefixe}${cle}-${index}`,
          priceDelta: 0,
          stock,
        })),
      },
    },
  })
  return { id: produit.id, nom }
}

async function rendreLaListe(
  raw: Record<string, string | string[] | undefined> = {}
): Promise<string> {
  const stream = await renderToReadableStream(
    <AdminProductsPage searchParams={Promise.resolve(raw)} />
  )
  return new Response(stream).text()
}

function sansBalises(fragment: string): string {
  return fragment
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function annonces(html: string): string[] {
  return [...html.matchAll(/<p[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/g)].map(
    ([, contenu]) => sansBalises(contenu ?? "")
  )
}

function annonceDesProduits(html: string): string {
  const trouvee = annonces(html).find((annonce) => annonce.includes("produit"))
  if (!trouvee) throw new Error("annonce du nombre de Produits absente")
  return trouvee
}

function texteDuTableau(html: string): string {
  const corps = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html)
  return corps ? sansBalises(corps[1]!) : ""
}

beforeAll(async () => {
  racine = await creerStructure({
    name: `Racine route ${runId}`,
    prefix: prefixe,
  })
  enfant = await creerStructure({
    name: `Enfant route ${runId}`,
    parentId: racine.id,
    prefix: prefixe,
  })
  autre = await creerStructure({
    name: `Autre route ${runId}`,
    prefix: prefixe,
  })
  paginee = await creerStructure({
    name: `Paginée route ${runId}`,
    prefix: prefixe,
  })

  chaise = await creerProduit(
    "chaise",
    `Chaise route ${runId}`,
    racine.id,
    30000,
    { creeLe: "2026-01-01T10:00:00.000Z", stocks: [2] }
  )
  table = await creerProduit(
    "table",
    `Table route ${runId}`,
    enfant.id,
    10000,
    { creeLe: "2026-01-02T10:00:00.000Z", stocks: [0] }
  )
  bureau = await creerProduit(
    "bureau",
    `Bureau route ${runId}`,
    autre.id,
    20000,
    { creeLe: "2026-01-03T10:00:00.000Z", stocks: [4] }
  )
  orphelin = await creerProduit(
    "orphelin",
    `Orphelin route ${runId}`,
    null,
    5000,
    { creeLe: "2026-01-04T10:00:00.000Z", stocks: [0] }
  )

  for (let index = 0; index < 11; index += 1) {
    await creerProduit(
      `page-${String(index).padStart(2, "0")}`,
      `Paginé route ${index} ${runId}`,
      paginee.id,
      1000 + index,
      {
        creeLe: `2026-02-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      }
    )
  }
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
  await prisma.$disconnect()
})

describe("la route de la Liste des Produits", () => {
  it("rend une page, annonce le total dans la région polie et ne pose aucun role grid", async () => {
    const total = await prisma.product.count()
    const html = await rendreLaListe()

    expect(html).toContain(chaise.nom)
    expect(html).toContain(table.nom)
    expect(html).toContain(bureau.nom)
    expect(annonceDesProduits(html)).toBe(
      `${total} ${total > 1 ? "produits" : "produit"}`
    )
    expect(html).not.toContain('role="grid"')
    expect(html).not.toContain('role="treegrid"')
    expect(html).toContain('aria-live="polite"')
  })

  it("relit la recherche depuis l'URL et ne rend que le Produit trouvé", async () => {
    const html = await rendreLaListe({ q: `Chaise route ${runId}` })

    expect(html).toContain(chaise.nom)
    expect(html).not.toContain(table.nom)
    expect(html).not.toContain(bureau.nom)
    expect(annonceDesProduits(html)).toBe("1 produit")
  })

  it("relit le filtre de Structure en incluant ses descendantes", async () => {
    const html = await rendreLaListe({ structure: racine.id })

    expect(html).toContain(chaise.nom)
    expect(html).toContain(table.nom)
    expect(html).not.toContain(bureau.nom)
    expect(annonceDesProduits(html)).toBe("2 produits")
  })

  it("relit le filtre sans Structure", async () => {
    const html = await rendreLaListe({
      structure: PRODUIT_STRUCTURE_SANS,
      q: runId,
    })

    expect(html).toContain(orphelin.nom)
    expect(html).not.toContain(chaise.nom)
    expect(annonceDesProduits(html)).toBe("1 produit")
  })

  it("relit le filtre de stock nul", async () => {
    const html = await rendreLaListe({
      structure: racine.id,
      stock: PRODUIT_STOCK_ZERO,
      q: runId,
    })

    expect(html).toContain(table.nom)
    expect(html).not.toContain(chaise.nom)
    expect(annonceDesProduits(html)).toBe("1 produit")
  })

  it("relit le tri et son sens depuis l'URL", async () => {
    const ascendant = await rendreLaListe({
      structure: racine.id,
      tri: "prix",
      sens: "asc",
      q: runId,
    })
    const descendant = await rendreLaListe({
      structure: racine.id,
      tri: "prix",
      sens: "desc",
      q: runId,
    })

    expect(texteDuTableau(ascendant).indexOf(table.nom)).toBeLessThan(
      texteDuTableau(ascendant).indexOf(chaise.nom)
    )
    expect(texteDuTableau(descendant).indexOf(chaise.nom)).toBeLessThan(
      texteDuTableau(descendant).indexOf(table.nom)
    )
  })

  it("relit la page et sa taille, sans rendre la première page", async () => {
    const html = await rendreLaListe({
      structure: paginee.id,
      pageSize: "10",
      page: "2",
      tri: "date",
      sens: "asc",
    })

    expect(html).toContain(`Paginé route 10 ${runId}`)
    expect(html).not.toContain(`Paginé route 0 ${runId}`)
    expect(annonceDesProduits(html)).toBe("11 produits")
  })

  it("retombe sur les valeurs sûres pour un paramètre inconnu, sans lever", async () => {
    const total = await prisma.product.count({
      where: { slug: { startsWith: prefixe } },
    })
    const html = await rendreLaListe({
      tri: "poids",
      sens: "upward",
      page: "abc",
      pageSize: "999",
      stock: "bizarre",
      misEnAvant: "oui",
      structure: "structure-disparue",
      q: runId,
    })

    expect(html).toContain(chaise.nom)
    expect(html).toContain(table.nom)
    expect(html).toContain(bureau.nom)
    expect(annonceDesProduits(html)).toBe(`${total} produits`)
  })

  it("rend l'état vide, pas un tableau cassé, quand rien ne correspond", async () => {
    const html = await rendreLaListe({ q: `introuvable-${runId}` })

    expect(html).toContain("Aucun Produit ne correspond à ces critères.")
    expect(html).not.toContain("<table")
    expect(annonceDesProduits(html)).toBe("0 produit")
  })

  it("ne laisse aucun lien ni bouton sans nom accessible", async () => {
    const html = await rendreLaListe({ structure: racine.id })

    for (const controle of html.matchAll(
      /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g
    )) {
      const nom = /aria-label="([^"]*)"/.exec(controle[2]!)?.[1]
      expect(nom || sansBalises(controle[3]!), controle[0]).toBeTruthy()
    }
  })
})
