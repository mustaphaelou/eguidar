import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  classerRevendication,
  creerRegistreBrouillonImageProduitPrisma,
  type Horloge,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import {
  codesAttendusParLeContrat,
  codesRefus,
  exigerEnteteRegistre,
  SCENARIOS_REGISTRE,
  tousLesCodesDuPort,
  type AdaptateurRegistre,
} from "@/test/contrat-registre-brouillon"
import { creerRegistreImageProduitMemoire } from "@/test/cycle-vie-image-produit-memoire"

const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"
const PROPRIETAIRE_TEMOIN = "editeur-temoin"
const AUTRE_TEMOIN = "editeur-temoin-2"
const AVANT_RETENTION = new Date("2026-05-01T11:00:00.000Z")
const MAINTENANT_TEMOIN = new Date("2026-05-01T11:00:00.001Z")
const APRES_RETENTION_TEMOIN = new Date("2026-05-01T11:00:00.002Z")

/**
 * Une rangée par refus que la règle doit savoir rendre. C'est un témoin de
 * non-vacuité, pas une seconde batterie de cas : six faits, lisibles d'un coup
 * d'œil, six verdicts. La rétention est le plus souvent intacte, pour que la
 * seule chose qui distingue ces refus soit bien l'état regardé.
 */
const LIGNES_POUR_TEMOINS = [
  {
    nom: "vivant, à son éditeur",
    state: "vivant",
    ownerId: PROPRIETAIRE_TEMOIN,
    tentativeId: null,
    expiresAt: APRES_RETENTION_TEMOIN,
  },
  {
    nom: "vivant, à un autre",
    state: "vivant",
    ownerId: AUTRE_TEMOIN,
    tentativeId: null,
    expiresAt: APRES_RETENTION_TEMOIN,
  },
  {
    nom: "revendiqué par une rivale",
    state: "revendiqué",
    ownerId: PROPRIETAIRE_TEMOIN,
    tentativeId: TENTATIVE_RIVALE,
    expiresAt: APRES_RETENTION_TEMOIN,
  },
  {
    nom: "libéré",
    state: "libéré",
    ownerId: PROPRIETAIRE_TEMOIN,
    tentativeId: null,
    expiresAt: APRES_RETENTION_TEMOIN,
  },
  {
    nom: "un état que le registre ne connaît pas",
    state: "état-inconnu",
    ownerId: PROPRIETAIRE_TEMOIN,
    tentativeId: null,
    expiresAt: APRES_RETENTION_TEMOIN,
  },
  {
    nom: "rétention échue",
    state: "vivant",
    ownerId: PROPRIETAIRE_TEMOIN,
    tentativeId: null,
    expiresAt: AVANT_RETENTION,
  },
].map(({ nom, ...reste }) => ({ nom, ...reste, productId: null }))

const proprietaire = randomUUID()
const autreProprietaire = randomUUID()
const categorieId = randomUUID()
const categorieSlug = `cat-registre-contrat-${categorieId.slice(0, 8)}`
const produits: [string, string] = [randomUUID(), randomUUID()]

/**
 * Le registre durable, construit sur l'horloge que le contrat lui passe : les
 * deux adaptateurs jouent le même scénario au même instant, sans quoi
 * l'accord porterait sur autre chose.
 */
const registreDurable: AdaptateurRegistre = (horloge: Horloge) =>
  creerRegistreBrouillonImageProduitPrisma(horloge)

const adaptateurs: readonly AdaptateurRegistre[] = [
  registreDurable,
  (horloge) => creerRegistreImageProduitMemoire(() => horloge.maintenant()),
]

const IDENTITE = { proprietaire, autreProprietaire, produits }

async function creerProduit(nom: string): Promise<string> {
  return prisma.product
    .create({
      data: {
        name: nom,
        slug: `produit-contrat-${randomUUID().slice(0, 8)}`,
        description: "description",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        category: { connect: { id: categorieId } },
      },
      select: { id: true },
    })
    .then((produit) => produit.id)
}

describe("registre des Brouillons d'Image produit — contrat des deux adaptateurs", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: proprietaire,
          name: "Éditeur Contrat",
          email: `contrat-${proprietaire}@example.test`,
          role: "admin",
        },
        {
          id: autreProprietaire,
          name: "Autre éditeur Contrat",
          email: `autre-contrat-${autreProprietaire}@example.test`,
          role: "admin",
        },
      ],
    })
    await prisma.category.create({
      data: { id: categorieId, name: "Catégorie contrat", slug: categorieSlug },
    })
    produits[0] = await creerProduit("Produit lié A")
    produits[1] = await creerProduit("Produit lié B")
  })

  beforeEach(async () => {
    // Chaque rejeu écrit un Brouillon neuf, avec un identifiant neuf : le
    // registre durable a une clé primaire, et un rejeu ne doit pas voir la
    // ligne du précédent.
    await prisma.brouillonImageProduit.deleteMany({
      where: { ownerId: proprietaire },
    })
    await prisma.brouillonImageProduit.deleteMany({
      where: { ownerId: autreProprietaire },
    })
  })

  afterAll(async () => {
    await prisma.brouillonImageProduit.deleteMany({
      where: { ownerId: { in: [proprietaire, autreProprietaire] } },
    })
    await prisma.product.deleteMany({ where: { id: { in: produits } } })
    await prisma.category.deleteMany({ where: { id: categorieId } })
    await prisma.user.deleteMany({
      where: { id: { in: [proprietaire, autreProprietaire] } },
    })
    await prisma.$disconnect()
  })

  for (const scenario of SCENARIOS_REGISTRE) {
    it(`les deux adaptateurs s'accordent : ${scenario.nom}`, async () => {
      await exigerEnteteRegistre(scenario, adaptateurs, IDENTITE)
    })
  }

  it("le contrat atteint tous les refus que le port sait exprimer", async () => {
    // Témoin de non-vacuité : un contrat où les deux adaptateurs refuseraient
    // la même chose, ou ne refuseraient jamais, passerait aussi facilement
    // qu'un contrat juste. Le port déclare `CodeRefusRegistreBrouillon` ; on
    // vérifie que le contrat le couvre entier, et la liste attendue est un
    // `Record` de ce code — `tsc` refuse donc déjà qu'un code y manque, avant
    // même que cette suite le cherche dans les observations.
    const atteints: string[] = []
    for (const scenario of SCENARIOS_REGISTRE) {
      const [observation] = await exigerEnteteRegistre(
        scenario,
        [registreDurable],
        IDENTITE
      )
      atteints.push(...codesRefus(observation))
    }

    // Les trois autres sont marqués « classification » dans la table : c'est la
    // règle partagée qui les rend, les deux adaptateurs ne peuvent pas en
    // diverger, et la suite de la classification épingle les six.
    expect([...new Set(atteints)].sort()).toEqual(codesAttendusParLeContrat())
  })

  it("la règle partagée sait rendre tous les refus du port", () => {
    // Le témoin déplacé, mais pas affaibli : les six codes doivent sortir des
    // verdicts de `classerRevendication`, sinon un refus serait devenu
    // inexprimable et le port le déclarerait encore.
    const rendus = new Set<string>()
    const contexte = {
      ownerId: PROPRIETAIRE_TEMOIN,
      tentativeId: TENTATIVE,
      now: MAINTENANT_TEMOIN,
    }
    const verdicts = [
      ...LIGNES_POUR_TEMOINS.map((ligne) =>
        classerRevendication(ligne, contexte)
      ),
      classerRevendication(null, contexte),
    ]
    for (const verdict of verdicts) {
      if (verdict.kind === "tranche") rendus.add(verdict.code)
      else if (verdict.kind === "a_ecrire") rendus.add(verdict.refusalSiEchec)
    }
    expect([...rendus].sort()).toEqual(tousLesCodesDuPort())
  })

  it("le contrat aperçoit une divergence que deux suites d'adaptateur laisseraient passer", async () => {
    // Un adaptateur qui répond `true` à une libération dont la rétention est
    // dépassée, sans laisser de trace : c'est la divergence du ticket. On la
    // fabrique le temps du cas, on ne la commite pas — le contrat doit la voir
    // échouer, sinon il ne prouve rien.
    const faux: AdaptateurRegistre = (horloge) => ({
      ...creerRegistreImageProduitMemoire(() => horloge.maintenant()),
      async marquerLibere() {
        return true
      },
    })
    const juste: AdaptateurRegistre = (horloge) =>
      creerRegistreImageProduitMemoire(() => horloge.maintenant())
    const scenario = SCENARIOS_REGISTRE.find((candidat) =>
      candidat.nom.includes("rétention est dépassée")
    )
    if (!scenario) throw new Error("Le scénario de rétention doit exister")

    await expect(
      exigerEnteteRegistre(scenario, [juste, faux], IDENTITE)
    ).rejects.toThrow()
  })
})
