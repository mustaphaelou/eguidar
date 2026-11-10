// @vitest-environment happy-dom

import { act } from "react"
import { describe, expect, it } from "vitest"

import { FormulaireImport } from "@/app/admin/produits/importer/formulaire-import"
import {
  LIMITE_OCTETS_IMPORT,
  MESSAGE_IMPORT_EN_COURS,
} from "@/lib/import-produits"
import { actionQuiCapture, monterFormulaire } from "@/test/rendu-formulaire"

const rendu = monterFormulaire()

function champFichier(): HTMLInputElement {
  const champ =
    rendu.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!champ) throw new Error("champ fichier absent du rendu")
  return champ
}

function formulaire(): HTMLFormElement {
  const form = rendu.container.querySelector("form")
  if (!form) throw new Error("formulaire absent du rendu")
  return form
}

async function choisir(fichier: File) {
  const champ = champFichier()
  Object.defineProperty(champ, "files", {
    value: [fichier],
    configurable: true,
  })
  await act(async () => {
    champ.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

function messageDErreur(): string {
  return rendu.container.querySelector('[role="alert"]')?.textContent ?? ""
}

describe("FormulaireImport", () => {
  it("porte un champ fichier nommé, limité au CSV, et une aide en français", () => {
    const { action } = actionQuiCapture<{ error?: string }>()
    rendu.render(<FormulaireImport action={action} />)

    const champ = champFichier()

    expect(champ.name).toBe("fichier")
    expect(champ.accept).toBe(".csv,text/csv")
    expect(champ.required).toBe(true)
    expect(rendu.container.textContent).toContain("5 Mo")
  })

  it("refuse dans le navigateur un fichier de plus de 5 Mo et empêche l'envoi", async () => {
    const { action, soumissions } = actionQuiCapture<{ error?: string }>()
    rendu.render(<FormulaireImport action={action} />)

    await choisir(
      new File(
        [new Uint8Array(LIMITE_OCTETS_IMPORT + 1)],
        "catalogue-trop-gros.csv"
      )
    )

    expect(messageDErreur()).toContain("5 Mo")
    expect(messageDErreur()).toMatch(/découp/i)
    expect(rendu.boutonDontLeLibelleEst("Téléverser le fichier").disabled).toBe(
      true
    )

    await rendu.soumettre(formulaire())

    expect(soumissions).toEqual([])
  })

  it("envoie à l'action le fichier choisi quand sa taille est acceptable", async () => {
    const { action, soumissions } = actionQuiCapture<{ error?: string }>()
    rendu.render(<FormulaireImport action={action} />)

    const fichier = new File(["slug,name\r\n"], "catalogue.csv", {
      type: "text/csv",
    })
    await choisir(fichier)

    expect(messageDErreur()).toBe("")
    expect(rendu.boutonDontLeLibelleEst("Téléverser le fichier").disabled).toBe(
      false
    )

    await rendu.soumettre(formulaire())

    expect(soumissions).toHaveLength(1)
    expect(soumissions[0]?.get("fichier")).toBeInstanceOf(File)
  })

  it("retire le refus de taille quand un fichier acceptable est choisi ensuite", async () => {
    const { action } = actionQuiCapture<{ error?: string }>()
    rendu.render(<FormulaireImport action={action} />)

    await choisir(
      new File([new Uint8Array(LIMITE_OCTETS_IMPORT + 1)], "trop-gros.csv")
    )
    expect(messageDErreur()).toContain("5 Mo")

    await choisir(new File(["slug,name\r\n"], "catalogue.csv"))

    expect(messageDErreur()).toBe("")
    expect(rendu.boutonDontLeLibelleEst("Téléverser le fichier").disabled).toBe(
      false
    )
  })

  it("désactive le champ et l'envoi tant qu'un import est en cours, en l'expliquant", async () => {
    const { action, soumissions } = actionQuiCapture<{ error?: string }>()
    rendu.render(
      <FormulaireImport
        action={action}
        indisponible={MESSAGE_IMPORT_EN_COURS}
      />
    )

    expect(champFichier().disabled).toBe(true)
    expect(rendu.container.textContent).toContain(MESSAGE_IMPORT_EN_COURS)
    expect(rendu.boutonDontLeLibelleEst("Téléverser le fichier").disabled).toBe(
      true
    )

    await rendu.soumettre(formulaire())

    expect(soumissions).toEqual([])
  })
})
