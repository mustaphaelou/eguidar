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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("./formulaire-import", () => ({
  FormulaireImport: ({
    action,
    indisponible,
  }: {
    action: unknown
    indisponible?: string | null
  }) => (
    <div
      data-testid="formulaire-import"
      data-action={typeof action}
      data-indisponible={indisponible ?? ""}
    />
  ),
}))

import ImportProductsPage from "./page"
import { prisma } from "@/lib/db"
import {
  COLONNES_IMPORT,
  MESSAGE_IMPORT_EN_COURS,
  MESSAGE_INDEXATION_EN_ATTENTE,
  type ColonneImport,
} from "@/lib/import-produits"
import {
  appliquerLeLot,
  televerserLeFichier,
  verifierLeLot,
} from "@/lib/use-cases/import-produits"
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
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
})

afterAll(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
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
    expect(baliseDuBouton(html, "Appliquer le Lot")).toContain('disabled=""')
    expect(html).toContain("Appliquer reste indisponible")
  })
})

const STRUCTURE_SLUG = `v-${runId}-maison`

function celluleCsv(valeur: string): string {
  return /[",\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur
}

function ligneCsv(valeurs: Partial<Record<ColonneImport, string>>): string {
  return COLONNES_IMPORT.map((colonne) =>
    celluleCsv(valeurs[colonne] ?? "")
  ).join(",")
}

function fichierCsv(...lignes: string[]): string {
  return [COLONNES_IMPORT.join(","), ...lignes].join("\r\n") + "\r\n"
}

async function semerLaStructure(): Promise<string> {
  const structure = await prisma.category.create({
    data: { name: "Maison", slug: STRUCTURE_SLUG },
  })
  return structure.id
}

async function semerLaChaise(categoryId: string): Promise<string> {
  const produit = await prisma.product.create({
    data: {
      slug: `v-${runId}-chaise`,
      name: "Chaise",
      brand: "Maison",
      description: "Bois massif",
      categoryId,
      price: 1250,
      specs: {},
      images: [],
      variants: {
        create: [
          {
            name: "Chaise en bois",
            sku: `${runId}-CHAISE-01`,
            priceDelta: 0,
            stock: 3,
          },
        ],
      },
    },
    include: { variants: true },
  })
  return produit.id
}

async function uploaderEtVerifier(contenu: string): Promise<string> {
  const televerse = await televerserLeFichier({
    nomFichier: "catalogue.csv",
    octets: new TextEncoder().encode(contenu),
    auteurId: AUTEUR_ID,
  })
  await verifierLeLot(televerse.lotId)
  return televerse.lotId
}

describe("la page d'import des Produits — le Lot vérifié", () => {
  it("rend les compteurs, les statuts et le diff avant → après", async () => {
    const categoryId = await semerLaStructure()
    await semerLaChaise(categoryId)

    const lotId = await uploaderEtVerifier(
      fichierCsv(
        ligneCsv({
          slug: `v-${runId}-chaise`,
          variant_sku: `${runId}-CHAISE-01`,
          variant_stock: "5",
        }),
        ligneCsv({
          slug: `v-${runId}-table`,
          name: "Table",
          brand: "Maison",
          category: STRUCTURE_SLUG,
          variant_sku: `${runId}-TABLE-01`,
          variant_name: "Table en bois",
          variant_price: "20.00",
          variant_stock: "2",
        })
      )
    )

    const html = await rendre({ lot: lotId })

    expect(html).toContain("Vérifié")
    expect(html).toContain("Résultat de la Vérification")
    expect(html).toMatch(/Produits créés<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toMatch(/Produits modifiés<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toMatch(/Produits inchangés<\/dt><dd[^>]*>0<\/dd>/)
    expect(html).toMatch(/Produits refusés<\/dt><dd[^>]*>0<\/dd>/)
    expect(html).toContain("À créer")
    expect(html).toContain("À modifier")
    expect(html).toContain("Changements")
    expect(html).toContain("Avant : 3")
    expect(html).toContain("Après : 5")
    expect(html).toContain("Vérifier le Lot")
    expect(html).toContain("application peut écrire les Produits annoncés")
    expect(baliseDuBouton(html, "Appliquer le Lot")).not.toContain(
      'disabled=""'
    )
  })

  it("rend chaque refus avec son numéro de Ligne et son code, et bloque Appliquer", async () => {
    const lotId = await uploaderEtVerifier(
      fichierCsv(
        ligneCsv({
          slug: `v-${runId}-etagere`,
          name: "Étagère",
          brand: "Maison",
          category: `v-${runId}-inconnue`,
          variant_sku: `${runId}-ETAGERE-01`,
          variant_name: "Étagère",
          variant_price: "30.00",
        })
      )
    )

    const html = await rendre({ lot: lotId })

    expect(html).toContain("Ligne 2")
    expect(html).toContain("structure_inconnue")
    expect(html).toContain("inconnue")
    expect(html).toContain("Produits refusés")
    expect(html).toMatch(/Produits refusés<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toContain("une seule Ligne ou un seul Produit est refusé")
    expect(baliseDuBouton(html, "Appliquer le Lot")).toContain('disabled=""')
  })

  it("rend les avertissements sans bloquer Appliquer", async () => {
    await prisma.product.create({
      data: {
        slug: `v-${runId}-existante`,
        name: "Chaise Longue",
        brand: "Maison",
        description: "",
        price: 1000,
        specs: {},
        images: [],
        variants: {
          create: [
            {
              name: "Existante",
              sku: `${runId}-EXISTANTE-01`,
              priceDelta: 0,
              stock: 1,
            },
          ],
        },
      },
    })

    const lotId = await uploaderEtVerifier(
      fichierCsv(
        ligneCsv({
          slug: `v-${runId}-nouvelle`,
          name: "chaise longue",
          brand: "Maison",
          variant_sku: `${runId}-NOUVELLE-01`,
          variant_name: "Nouvelle",
          variant_price: "10.00",
        })
      )
    )

    const html = await rendre({ lot: lotId })

    expect(html).toContain("pas de Structure")
    expect(html).toContain("doublon")
    expect(html).toMatch(/Produits refusés<\/dt><dd[^>]*>0<\/dd>/)
    expect(html).toContain("application peut écrire les Produits annoncés")
    expect(baliseDuBouton(html, "Appliquer le Lot")).not.toContain(
      'disabled=""'
    )
  })
})

describe("la page d'import des Produits — le Lot appliqué", () => {
  function effetsSansIndexation(echoue = false) {
    return {
      reindexProducts: vi.fn(async () => {
        if (echoue) throw new Error("Meili indisponible")
      }),
      revalidateCatalog: vi.fn(),
      purgeCatalogue: vi.fn(),
      deleteImages: vi.fn(async () => {}),
      enregistrerImages: vi.fn(async () => {}),
    }
  }

  it("distingue les Produits écrits des Produits indexés et dit le Lot terminé", async () => {
    const lotId = await uploaderEtVerifier(
      fichierCsv(
        ligneCsv({
          slug: `v-${runId}-appliquee`,
          name: "Appliquée",
          brand: "Maison",
          variant_sku: `${runId}-APPLIQUEE-01`,
          variant_name: "Unique",
          variant_price: "10.00",
        })
      )
    )
    await appliquerLeLot(lotId, 0, effetsSansIndexation())

    const html = await rendre({ lot: lotId })

    expect(html).toContain("Résultat de l&#x27;application")
    expect(html).toMatch(/Produits écrits<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toMatch(/Produits indexés<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toContain("Terminé")
    expect(html).toContain("tous ses Produits sont écrits et indexés")
    expect(html).toContain("Écrite")
    expect(baliseDuBouton(html, "Appliquer le Lot")).toContain('disabled=""')
  })

  it("affiche l'indexation en attente et jamais terminé quand l'indexation est en retard", async () => {
    const lotId = await uploaderEtVerifier(
      fichierCsv(
        ligneCsv({
          slug: `v-${runId}-attente`,
          name: "En attente",
          brand: "Maison",
          variant_sku: `${runId}-ATTENTE-01`,
          variant_name: "Unique",
          variant_price: "10.00",
        })
      )
    )
    await appliquerLeLot(lotId, 0, effetsSansIndexation(true))

    const html = await rendre({ lot: lotId })

    expect(html).toContain("En cours")
    expect(html).toMatch(/Produits écrits<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toMatch(/Produits indexés<\/dt><dd[^>]*>0<\/dd>/)
    expect(html.replaceAll("&#x27;", "'")).toContain(
      MESSAGE_INDEXATION_EN_ATTENTE
    )
    expect(html).not.toContain("tous ses Produits sont écrits et indexés")
    expect(html).toContain("Reprendre l&#x27;application")
  })

  it("montre la raison d'un Produit en échec sur ses Lignes et le Lot partiel", async () => {
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "9".repeat(64),
        taille: 64,
        statut: "partiel",
        ecrits: 0,
        indexes: 0,
      },
    })
    await prisma.ligneImport.create({
      data: {
        lotId: lot.id,
        numero: 2,
        slug: `v-${runId}-echec`,
        sku: `${runId}-ECHEC-01`,
        cellules: { slug: `v-${runId}-echec` },
        statut: "echouee",
        motifEchec: "Panne simulée du Catalogue",
      },
    })

    const html = await rendre({ lot: lot.id })

    expect(html).toContain("Partiel")
    expect(html).toContain("Échec d&#x27;écriture : Panne simulée du Catalogue")
    expect(html).toContain("application est partielle")
  })
})

describe("la page d'import des Produits — le Lot en cours", () => {
  function effetsSansIndexation() {
    return {
      reindexProducts: vi.fn(async () => {}),
      revalidateCatalog: vi.fn(),
      purgeCatalogue: vi.fn(),
      deleteImages: vi.fn(async () => {}),
      enregistrerImages: vi.fn(async () => {}),
    }
  }

  function fichierDeNProduits(prefixe: string, nombre: number): string {
    return fichierCsv(
      ...Array.from({ length: nombre }, (_inutilise, position) =>
        ligneCsv({
          slug: `v-${runId}-${prefixe}-${position}`,
          name: `Produit ${prefixe} ${position}`,
          brand: "Maison",
          variant_sku: `${runId}-${prefixe.toUpperCase()}-${position}`,
          variant_name: "Unique",
          variant_price: "10.00",
        })
      )
    )
  }

  it("signale le Lot en cours et désactive le téléversement quand aucun Lot n'est ouvert", async () => {
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "7".repeat(64),
        taille: 64,
        statut: "en_cours",
        curseur: 25,
        ecrits: 25,
        indexes: 25,
      },
    })

    const html = await rendre()
    const texte = html.replaceAll("&#x27;", "'")

    expect(texte).toContain("Un import est en cours")
    expect(
      liensVers(html, `/admin/produits/importer?lot=${lot.id}`)[0]?.texte
    ).toBe("Reprendre")
    expect(texte).toContain(`data-indisponible="${MESSAGE_IMPORT_EN_COURS}"`)
  })

  it("rouvre un Lot interrompu au curseur, propose la reprise et la poursuit jusqu'au bout", async () => {
    const lotId = await uploaderEtVerifier(
      fichierDeNProduits("reprise-page", 27)
    )

    const premier = await appliquerLeLot(lotId, 0, effetsSansIndexation())
    expect(premier).toMatchObject({
      statut: "en_cours",
      curseurSuivant: 25,
      ecrits: 25,
      reste: 2,
    })

    const html = await rendre({ lot: lotId })
    const texte = html.replaceAll("&#x27;", "'")

    expect(html).toContain("En cours")
    expect(texte).toContain("Reprendre l'application")
    expect(html).toMatch(/Produits traités<\/dt><dd[^>]*>25 \/ 27<\/dd>/)
    expect(texte).toContain(`data-indisponible="${MESSAGE_IMPORT_EN_COURS}"`)

    const seconde = await appliquerLeLot(
      lotId,
      premier.curseurSuivant,
      effetsSansIndexation()
    )
    expect(seconde).toMatchObject({
      statut: "termine",
      ecrits: 27,
      indexes: 27,
    })

    const termine = await rendre({ lot: lotId })
    expect(termine).toContain("Terminé")
    expect(termine).toMatch(/Produits traités<\/dt><dd[^>]*>27 \/ 27<\/dd>/)
  })
})
