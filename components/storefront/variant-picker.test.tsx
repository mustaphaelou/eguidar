// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { ajouterArticleAuPanierActionMock } = vi.hoisted(() => ({
  ajouterArticleAuPanierActionMock: vi.fn(),
}))

vi.mock("@/app/(boutique)/actions", () => ({
  ajouterArticleAuPanierAction: ajouterArticleAuPanierActionMock,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => (
    <div data-slot="select-stub">{children}</div>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}))

import { MESSAGE_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { VariantPicker } from "./variant-picker"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const variantes = [
  { id: "variante-a", name: "Standard", sku: "VP-A", priceDelta: 0, stock: 4 },
]

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  ajouterArticleAuPanierActionMock.mockReset()
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function picker() {
  return <VariantPicker basePrice={100000} variants={variantes} />
}

async function cliquerAjouter() {
  const bouton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Ajouter au panier")
  )!
  act(() => {
    bouton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
  await act(async () => {})
}

describe("VariantPicker", () => {
  it("confirms the addition when the action succeeds", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({ ok: true })

    render(picker())
    await cliquerAjouter()

    expect(container.textContent).toContain("Ajouté au panier")
    expect(container.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })

  it("shows the explicit cap message when the Visiteur's Panier is full", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({
      ok: false,
      motif: "cap-atteinte",
    })

    render(picker())
    await cliquerAjouter()

    expect(ajouterArticleAuPanierActionMock).toHaveBeenCalledTimes(1)
    expect(ajouterArticleAuPanierActionMock.mock.calls[0]).toHaveLength(2)
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_CAP_ATTEINTE
    )
    expect(container.textContent).toContain("20 articles maximum")
    expect(container.textContent).not.toContain("Ajouté au panier")
  })

  it("stays silent on any other refusal", async () => {
    ajouterArticleAuPanierActionMock.mockResolvedValue({
      ok: false,
      motif: "quantite-invalide",
    })

    render(picker())
    await cliquerAjouter()

    expect(container.textContent).not.toContain("Ajouté au panier")
    expect(container.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })
})
