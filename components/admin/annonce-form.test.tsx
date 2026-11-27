// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import type { AnnonceFormState } from "@/app/admin/annonce/actions"
import { AnnonceForm } from "@/components/admin/annonce-form"
import { actionQuiCapture, monterFormulaire } from "@/test/rendu-formulaire"

const rendu = monterFormulaire()

function apercu(): HTMLElement {
  const section = rendu.container.querySelector<HTMLElement>(
    'section[aria-label="Aperçu sur la boutique"]'
  )
  if (!section) throw new Error("section d'aperçu absente")
  return section
}

function formulaire(): HTMLFormElement {
  const form = rendu.container.querySelector<HTMLFormElement>("form")
  if (!form) throw new Error("formulaire absent")
  return form
}

function interrupteur(): HTMLElement {
  const control = rendu.container.querySelector<HTMLElement>(
    '[aria-label="Afficher sur la boutique"]'
  )
  if (!control) throw new Error("interrupteur d'activation absent")
  return control
}

function champ(nom: "message" | "lienUrl" | "lienLibelle"): HTMLInputElement {
  const input = rendu.container.querySelector<HTMLInputElement>(
    `input[name="${nom}"]`
  )
  if (!input) throw new Error(`champ ${nom} absent`)
  return input
}

async function saisir(input: HTMLInputElement, valeur: string): Promise<void> {
  const descripteur = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )
  await act(async () => {
    descripteur?.set?.call(input, valeur)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function basculerActivation(): Promise<void> {
  await act(async () => {
    interrupteur().click()
  })
}

describe("AnnonceForm", () => {
  it("rend l'état initial masqué et l'aperçu correspondant", () => {
    const { action } = actionQuiCapture<AnnonceFormState>()
    rendu.render(
      <AnnonceForm
        initialAnnonce={{
          actif: false,
          message: "",
          lienUrl: null,
          lienLibelle: null,
        }}
        action={action}
      />
    )

    expect(interrupteur().getAttribute("aria-checked")).toBe("false")
    expect(champ("message").value).toBe("")
    expect(champ("lienUrl").value).toBe("")
    expect(champ("lienLibelle").value).toBe("")
    expect(apercu().textContent).toContain("Masquée sur la boutique")
  })

  it("rend l'état initial actif avec message et lien interne dans l'aperçu", () => {
    const { action } = actionQuiCapture<AnnonceFormState>()
    rendu.render(
      <AnnonceForm
        initialAnnonce={{
          actif: true,
          message: "Livraison offerte dès 500 MAD",
          lienUrl: "/produits",
          lienLibelle: "Découvrir",
        }}
        action={action}
      />
    )

    expect(interrupteur().getAttribute("aria-checked")).toBe("true")
    expect(apercu().textContent).toContain("Livraison offerte dès 500 MAD")
    const lien = apercu().querySelector<HTMLElement>("[data-preview-href]")
    expect(lien?.textContent).toBe("Découvrir")
    expect(lien?.getAttribute("data-preview-href")).toBe("/produits")
  })

  it("met à jour l'aperçu en direct au fil du basculement et de la saisie", async () => {
    const { action } = actionQuiCapture<AnnonceFormState>()
    rendu.render(
      <AnnonceForm
        initialAnnonce={{
          actif: false,
          message: "",
          lienUrl: null,
          lienLibelle: null,
        }}
        action={action}
      />
    )

    expect(apercu().textContent).toContain("Masquée sur la boutique")

    await basculerActivation()
    expect(interrupteur().getAttribute("aria-checked")).toBe("true")
    expect(apercu().textContent).toContain(
      "Saisissez un message pour prévisualiser le ruban."
    )

    await saisir(champ("message"), "Nouvelle collection disponible")
    expect(apercu().textContent).toContain("Nouvelle collection disponible")
    expect(apercu().querySelector("[data-preview-href]")).toBeNull()

    await saisir(champ("lienUrl"), "/produits")
    expect(apercu().querySelector("[data-preview-href]")).toBeNull()

    await saisir(champ("lienLibelle"), "Voir le catalogue")
    const lien = apercu().querySelector<HTMLElement>("[data-preview-href]")
    expect(lien?.textContent).toBe("Voir le catalogue")
    expect(lien?.getAttribute("data-preview-href")).toBe("/produits")

    await saisir(champ("lienUrl"), "")
    expect(apercu().querySelector("[data-preview-href]")).toBeNull()

    await basculerActivation()
    expect(apercu().textContent).toContain("Masquée sur la boutique")
  })

  it("affiche l'erreur de validation en français retournée par l'action", async () => {
    const action = vi.fn(async (): Promise<AnnonceFormState> => ({
      error: "le message est requis lorsque l'Annonce est active",
    }))
    rendu.render(
      <AnnonceForm
        initialAnnonce={{
          actif: false,
          message: "",
          lienUrl: null,
          lienLibelle: null,
        }}
        action={action}
      />
    )

    await basculerActivation()
    await rendu.soumettre(formulaire())

    const alerte = rendu.container.querySelector<HTMLElement>('[role="alert"]')
    expect(alerte?.textContent).toBe(
      "le message est requis lorsque l'Annonce est active"
    )
    expect(rendu.container.querySelector('[role="status"]')).toBeNull()
  })

  it("transmet les champs saisis à l'action et affiche la confirmation", async () => {
    const soumissions: FormData[] = []
    const action = vi.fn(
      async (
        _precedent: AnnonceFormState,
        formData: FormData
      ): Promise<AnnonceFormState> => {
        soumissions.push(formData)
        return { saved: true }
      }
    )
    rendu.render(
      <AnnonceForm
        initialAnnonce={{
          actif: false,
          message: "",
          lienUrl: null,
          lienLibelle: null,
        }}
        action={action}
      />
    )

    await basculerActivation()
    await saisir(champ("message"), "Livraison offerte ce week-end")
    await saisir(champ("lienUrl"), "/produits")
    await saisir(champ("lienLibelle"), "Découvrir")
    await rendu.soumettre(formulaire())

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]!.get("actif")).toBe("true")
    expect(soumissions[0]!.get("message")).toBe("Livraison offerte ce week-end")
    expect(soumissions[0]!.get("lienUrl")).toBe("/produits")
    expect(soumissions[0]!.get("lienLibelle")).toBe("Découvrir")

    const statut = rendu.container.querySelector<HTMLElement>('[role="status"]')
    expect(statut?.textContent).toBe("Annonce enregistrée.")
  })
})
