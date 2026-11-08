import { describe, expect, it } from "vitest"

import {
  declarerDepuisLaCharge,
  analyserCharge,
} from "@/lib/apres-ecriture-redeclaration"
import {
  BRANCHE_SANS_STRUCTURE,
  declarerApresEcriture,
  type PlanApresEcriture,
} from "@/lib/apres-ecriture"

const COMMANDE = "commande-958"
const PRODUIT = "produit-958"
const SLUG = "produit-958"
const CATEGORIE = "categorie-958"
const CIBLE_A = "cible-958-a"
const CIBLE_B = "cible-958-b"
const IMAGE = "https://cdn.example.test/958.jpg"

const SNAPSHOT = {
  userEmail: "client-958@example.test",
  orderId: COMMANDE,
  items: [
    {
      productName: "Produit 958",
      variantName: "Standard",
      quantity: 1,
      price: 12000,
    },
  ],
  total: 12000,
  shippingFee: 0,
  totalPayable: 12000,
  cityName: "Casablanca",
  address: "1 rue du Test",
  phone: "0600000000",
}

function durables(plan: PlanApresEcriture) {
  return plan.consequences
    .filter((consequence) => consequence.durable)
    .map((consequence) => [
      consequence.action,
      consequence.entite.type,
      consequence.entite.id,
      consequence.portee,
    ])
}

function verifierRedeclaration(
  type: Parameters<typeof declarerDepuisLaCharge>[0],
  genre: Parameters<typeof declarerApresEcriture>[0],
  faits: Parameters<typeof declarerApresEcriture>[1],
  charge: unknown
): void {
  const ecriture = declarerApresEcriture(genre, faits)
  const redeclaration = declarerDepuisLaCharge(type, COMMANDE, charge)
  expect(redeclaration).not.toBeNull()
  expect(redeclaration!.genre).toBe(genre)
  expect(durables(redeclaration!.plan)).toEqual(durables(ecriture))
}

describe("la redéclaration du plan depuis la Charge", () => {
  it("redéclare commande.creee avec l'identifiant que la Charge omet", () => {
    verifierRedeclaration(
      "commande.creee",
      "commande.creee",
      { commandeId: COMMANDE, snapshot: SNAPSHOT },
      { snapshot: SNAPSHOT }
    )
  })

  it("redéclare commande.statut.changee avec son statut", () => {
    verifierRedeclaration(
      "commande.statut.changee",
      "commande.statut.changee",
      { commandeId: COMMANDE, snapshot: SNAPSHOT, statut: "shipped" },
      { snapshot: SNAPSHOT, statut: "shipped" }
    )
  })

  it("redéclare produit.enregistre avec image retirée", () => {
    verifierRedeclaration(
      "produit.enregistre",
      "produit.enregistre",
      {
        produitId: PRODUIT,
        slug: SLUG,
        slugPrecedent: "produit-958-precedent",
        categoryId: CATEGORIE,
        categoryIdPrecedent: "categorie-958-precedente",
        imagesRetirees: [IMAGE],
      },
      {
        produitId: PRODUIT,
        slug: SLUG,
        slugPrecedent: "produit-958-precedent",
        categoryId: CATEGORIE,
        categoryIdPrecedent: "categorie-958-precedente",
        imagesRetirees: [IMAGE],
      }
    )
  })

  it("redéclare produit.enregistre sans image retirée", () => {
    verifierRedeclaration(
      "produit.enregistre",
      "produit.enregistre",
      { produitId: PRODUIT, slug: SLUG, imagesRetirees: [] },
      {
        produitId: PRODUIT,
        slug: SLUG,
        slugPrecedent: null,
        categoryId: null,
        categoryIdPrecedent: null,
        imagesRetirees: [],
      }
    )
  })

  it("redéclare produit.supprime et ses quatre conséquences durables", () => {
    verifierRedeclaration(
      "produit.supprime",
      "produit.supprime",
      {
        produitId: PRODUIT,
        slug: SLUG,
        categoryId: CATEGORIE,
        imagesRetirees: [IMAGE],
      },
      {
        produitId: PRODUIT,
        slug: SLUG,
        categoryId: CATEGORIE,
        imagesRetirees: [IMAGE],
      }
    )
  })

  it("redéclare variante.stock.changee malgré une Charge qui ne porte que l'id", () => {
    verifierRedeclaration(
      "variante.stock.changee",
      "variante.stock.changee",
      { produitId: PRODUIT, slug: SLUG, categoryId: CATEGORIE },
      { produitId: PRODUIT }
    )
  })

  it("redéclare structure.creee", () => {
    verifierRedeclaration(
      "structure.creee",
      "structure.creee",
      { categorieId: CATEGORIE },
      { categorieId: CATEGORIE }
    )
  })

  it("redéclare structure.modifiee avec l'image et la destination de la Charge", () => {
    verifierRedeclaration(
      "structure.modifiee",
      "structure.modifiee",
      {
        categorieId: CATEGORIE,
        imagesRetirees: [IMAGE],
        destinations: [CIBLE_A],
      },
      {
        categorieId: CATEGORIE,
        imagesRetirees: [IMAGE],
        destinations: [CIBLE_A],
      }
    )
  })

  it("redéclare structure.modifiee sans image ni destination", () => {
    verifierRedeclaration(
      "structure.modifiee",
      "structure.modifiee",
      { categorieId: CATEGORIE, imagesRetirees: [], destinations: [] },
      { categorieId: CATEGORIE, imagesRetirees: [], destinations: [] }
    )
  })

  it("redéclare structure.supprimee et toutes ses branches, Sans Structure comprise", () => {
    verifierRedeclaration(
      "structure.supprimee",
      "structure.supprimee",
      {
        categorieId: CATEGORIE,
        imagesRetirees: [IMAGE],
        destinations: [CIBLE_A, CIBLE_B, BRANCHE_SANS_STRUCTURE],
      },
      {
        categorieId: CATEGORIE,
        imagesRetirees: [IMAGE],
        destinations: [CIBLE_A, CIBLE_B, BRANCHE_SANS_STRUCTURE],
      }
    )
  })

  it("ne redéclare rien pour un déclencheur planifié", () => {
    expect(
      declarerDepuisLaCharge("planification.digest-stock-bas", "plan-1", {
        jour: "2026-11-08",
      })
    ).toBeNull()
  })

  it("nomme le champ d'une Charge invalide", () => {
    expect(() => analyserCharge("produit.enregistre", { slug: SLUG })).toThrow(
      /Contrat de charge violé pour « produit\.enregistre » : produitId/
    )
  })
})
