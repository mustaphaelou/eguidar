// @vitest-environment happy-dom

import { randomUUID } from "node:crypto"

import { act } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { monterFormulaire } from "@/test/rendu-formulaire"

import { DeleteProductButton } from "@/components/admin/delete-product-button"
import { prisma } from "@/lib/db"
import { CHAMPS_FORMULAIRE_PRODUIT } from "@/lib/formulaire-produit"
import {
  deleteProduct,
  type CatalogEffects,
} from "@/lib/use-cases/admin-catalog"

const runId = randomUUID().slice(0, 8)
const produitSlug = (suffixe: string) => `suppression-${runId}-${suffixe}`

const EFFETS_SILENCIEUX: Partial<CatalogEffects> = {
  reindexProducts: async () => {},
  removeProductFromIndex: async () => {},
  revalidateCatalog: () => {},
  deleteImages: async () => {},
}

const rendu = monterFormulaire()

async function creerProduit(nom: string) {
  return prisma.product.create({
    data: {
      name: nom,
      slug: produitSlug(nom.toLowerCase().replaceAll(" ", "-")),
      description: "Description de test",
      brand: "Marque",
      price: 100000,
      specs: {},
      images: [],
    },
  })
}

function dialogue(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-content"]'
  )
}

function boutonsDuDialogue(): HTMLButtonElement[] {
  return [...(dialogue()?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
}

function declencheur(): HTMLButtonElement {
  const bouton = [
    ...rendu.container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((candidat) => candidat.textContent === "Supprimer")
  if (!bouton) throw new Error("déclencheur « Supprimer » absent")
  return bouton
}

function boutonDuDialogue(libelle: string): HTMLButtonElement {
  const bouton = boutonsDuDialogue().find(
    (candidat) => candidat.textContent === libelle
  )
  if (!bouton) throw new Error(`bouton absent du dialogue : « ${libelle} »`)
  return bouton
}

async function ouvrirDialogue() {
  await act(async () => {
    declencheur().click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function cliquer(bouton: HTMLButtonElement) {
  await act(async () => {
    bouton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("DeleteProductButton", () => {
  beforeAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `suppression-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `suppression-${runId}-` } },
    })
    await prisma.$disconnect()
  })

  it("nomme le Produit dans une boîte de dialogue, le confirme explicitement et le supprime", async () => {
    const produit = await creerProduit("Produit nommé")
    const confirmeNatif = vi.fn(() => true)
    vi.stubGlobal("confirm", confirmeNatif)
    const action = async (formData: FormData) => {
      await deleteProduct(
        String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.produit)),
        EFFETS_SILENCIEUX
      )
    }

    rendu.render(
      <DeleteProductButton
        productId={produit.id}
        productName={produit.name}
        action={action}
      />
    )

    await ouvrirDialogue()

    expect(dialogue()).not.toBeNull()
    expect(dialogue()!.textContent).toContain(`Supprimer « ${produit.name} »`)
    expect(dialogue()!.textContent).toContain("définitive")
    expect(boutonDuDialogue("Supprimer définitivement")).toBeTruthy()
    expect(document.activeElement).toBe(boutonDuDialogue("Annuler"))

    await cliquer(boutonDuDialogue("Annuler"))

    expect(dialogue()).toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: produit.id } })
    ).resolves.not.toBeNull()
    expect(confirmeNatif).not.toHaveBeenCalled()

    await ouvrirDialogue()
    await rendu.soumettre(dialogue()!.querySelector<HTMLFormElement>("form")!)

    await expect(
      prisma.product.findUnique({ where: { id: produit.id } })
    ).resolves.toBeNull()
    expect(confirmeNatif).not.toHaveBeenCalled()
  })
})
