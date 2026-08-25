// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { addToCartActionMock } = vi.hoisted(() => ({
  addToCartActionMock: vi.fn(),
}))

vi.mock("@/app/(boutique)/actions", () => ({
  addToCartAction: addToCartActionMock,
}))

import { MESSAGE_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { ProductBuyBox } from "./product-buy-box"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const variantes = [
  { id: "variante-a", name: "Standard", sku: "PBB-A", priceDelta: 0, stock: 4 },
]

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  addToCartActionMock.mockReset()
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

function buyBox() {
  return (
    <ProductBuyBox
      basePrice={100000}
      variants={variantes}
      freeShipping={false}
    />
  )
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

describe("ProductBuyBox", () => {
  it("confirms the addition when the action succeeds", async () => {
    addToCartActionMock.mockResolvedValue(true)

    render(buyBox())
    await cliquerAjouter()

    expect(container.textContent).toContain("Ajouté au panier")
    expect(container.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })

  it("shows the explicit cap message when the Visiteur's Panier is full", async () => {
    addToCartActionMock.mockResolvedValue("cap-atteinte")

    render(buyBox())
    await cliquerAjouter()

    expect(addToCartActionMock).toHaveBeenCalledTimes(1)
    expect(addToCartActionMock.mock.calls[0]).toHaveLength(2)
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_CAP_ATTEINTE
    )
    expect(container.textContent).toContain("20 articles maximum")
    expect(container.textContent).not.toContain("Ajouté au panier")
  })

  it("stays silent on any other refusal", async () => {
    addToCartActionMock.mockResolvedValue(false)

    render(buyBox())
    await cliquerAjouter()

    expect(container.textContent).not.toContain("Ajouté au panier")
    expect(container.textContent).not.toContain(MESSAGE_CAP_ATTEINTE)
  })
})
