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

vi.mock("./formulaire-import", () => ({
  FormulaireImport: ({ action }: { action: unknown }) => (
    <div data-testid="formulaire-import" data-action={typeof action} />
  ),
}))

import ImportProductsPage from "./page"
import { prisma } from "@/lib/db"
import { liensVers } from "@/test/liens-vers"

const runId = randomUUID().slice(0, 8)
const AUTEUR_ID = `page-import-auteur-${runId}`
const AUTEUR_NOM = `Auteur import ${runId}`
const AUTEUR_EMAIL = `page-import-${runId}@example.test`

async function rendre(
  raw: Record<string, string | string[] | undefined> = {}
): Promise<string> {
  const stream = await renderToReadableStream(
    <ImportProductsPage searchParams={Promise.resolve(raw)} />
  )
  return new Response(stream).text()
}

function etapeCourante(html: string): string {
  const trouvee = /<li[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/.exec(html)
  if (!trouvee) throw new Error("aucune étape courante dans le rendu")
  return trouvee[1]!
}

function baliseDuBouton(html: string, libelle: string): string {
  const index = html.indexOf(libelle)
  if (index === -1) throw new Error(`bouton « ${libelle} » absent du rendu`)
  const debut = html.lastIndexOf("<button", index)
  return html.slice(debut, index)
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: AUTEUR_ID,
      name: AUTEUR_NOM,
      email: AUTEUR_EMAIL,
      role: "admin",
    },
  })
})

beforeEach(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
})

afterAll(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
  await prisma.user.deleteMany({ where: { id: AUTEUR_ID } })
  await prisma.$disconnect()
})

describe("la page d'import des Produits", () => {
  it("rend les trois étapes et marque Téléverser comme l'étape courante", async () => {
    const html = await rendre()

    expect(html).toContain("Téléverser")
    expect(html).toContain("Vérifier")
    expect(html).toContain("Appliquer")
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(etapeCourante(html)).toContain("Téléverser")
    expect(etapeCourante(html)).not.toContain("Vérifier")
  })

  it("propose le modèle vierge au téléchargement", async () => {
    const html = await rendre()
    const lien = liensVers(html, "/api/admin/produits/importer/modele")[0]

    expect(lien?.texte).toBe("Télécharger le modèle")
    expect(lien?.balise).toContain("download")
  })

  it("rend le formulaire de téléversement et lui confie l'action serveur", async () => {
    const html = await rendre()

    expect(html).toContain('data-testid="formulaire-import"')
    expect(html).toContain('data-action="function"')
  })

  it("relit un Lot accepté avec son auteur, sa taille, son empreinte et ses avertissements", async () => {
    const avertissement =
      "La colonne « notes » est ignorée : elle ne fait pas partie des neuf colonnes attendues."
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "b".repeat(64),
        taille: 42,
        statut: "brouillon",
        avertissements: [avertissement],
      },
    })

    const html = await rendre({ lot: lot.id })

    expect(html).toContain("Brouillon")
    expect(html).toContain(AUTEUR_NOM)
    expect(html).toContain(AUTEUR_EMAIL)
    expect(html).toContain("42 octets")
    expect(html).toContain("b".repeat(64))
    expect(html).toContain(avertissement)
    expect(html).toContain("Le fichier est accepté.")
    expect(html).toContain('data-testid="formulaire-import"')
  })

  it("relit un Lot refusé avec son motif", async () => {
    const motif =
      "Le fichier dépasse 5 Mo. Découpez-le en plusieurs fichiers plus petits."
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "c".repeat(64),
        taille: 6_000_000,
        statut: "echoue",
        motifEchec: motif,
      },
    })

    const html = await rendre({ lot: lot.id })

    expect(html).toContain("Échoué")
    expect(html).toContain(motif)
    expect(html).toContain("aucun Produit, aucune Variante et aucune Structure")
  })

  it("dit qu'un Lot inconnu est introuvable, sans panneau", async () => {
    const html = await rendre({ lot: "lot-inconnu" })

    expect(html).toContain("est introuvable.")
    expect(html).not.toContain('aria-label="Lot d')
  })

  it("liste les Lignes lues, groupées par Produit, avec leurs refus et leurs avertissements", async () => {
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "d".repeat(64),
        taille: 128,
      },
    })
    await prisma.ligneImport.createMany({
      data: [
        {
          lotId: lot.id,
          numero: 2,
          slug: "chaise",
          sku: "CHAISE-01",
          cellules: { slug: "chaise" },
          statut: null,
        },
        {
          lotId: lot.id,
          numero: 3,
          slug: "chaise",
          sku: "CHAISE-02",
          cellules: { slug: "chaise" },
          statut: "refusee",
          codeRefus: "prix_invalide",
        },
        {
          lotId: lot.id,
          numero: 4,
          slug: "table",
          sku: "TABLE-01",
          cellules: { slug: "table" },
          avertissements: ["description_html"],
        },
      ],
    })

    const html = await rendre({ lot: lot.id })

    expect(html).toContain("Lignes lues")
    expect(html).toContain("3 lignes lues")
    expect(html).toContain('aria-label="Produit chaise"')
    expect(html).toContain('aria-label="Produit table"')
    expect(html).toContain("Produit")
    expect(html).toContain("chaise")
    expect(html).toContain("table")
    expect(html).toContain("Ligne 2")
    expect(html).toContain("Ligne 3")
    expect(html).toContain("Ligne 4")
    expect(html).toContain("CHAISE-01")
    expect(html).toContain("CHAISE-02")
    expect(html).toContain("TABLE-01")
    expect(html).toContain("prix de la Variante")
    expect(html).toContain("un montant valide")
    expect(html).toContain("La description ressemble à du HTML")
  })

  it("présente les Lignes illisibles hors des Produits", async () => {
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "e".repeat(64),
        taille: 64,
      },
    })
    await prisma.ligneImport.createMany({
      data: [
        {
          lotId: lot.id,
          numero: 3,
          slug: "",
          sku: "",
          cellules: {},
          statut: "refusee",
          codeRefus: "ligne_mal_formee",
        },
      ],
    })

    const html = await rendre({ lot: lot.id })

    expect(html).toContain("Lignes illisibles")
    expect(html).toContain("Ligne 3")
    expect(html).toContain("enregistrement CSV valide")
  })

  it("garde Appliquer indisponible tant que le Lot reste brouillon", async () => {
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "f".repeat(64),
        taille: 64,
        statut: "brouillon",
      },
    })

    const html = await rendre({ lot: lot.id })

    expect(html).toContain("Appliquer le Lot")
    expect(baliseDuBouton(html, "Appliquer le Lot")).toContain("disabled")
    expect(html).toContain("Appliquer reste indisponible")
  })
})
