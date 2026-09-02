// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuthDialogsProvider,
  useAuthDialogs,
} from "@/components/auth/auth-dialogs-context"
import { UrlAuthDialog } from "@/components/auth/url-auth-dialog"

const { placeOrderMock, searchParamsState } = vi.hoisted(() => ({
  placeOrderMock: vi.fn(),
  searchParamsState: {
    value: new URLSearchParams(),
    sync(query: string) {
      this.value = new URLSearchParams(query)
    },
  },
}))

vi.mock("@/app/(boutique)/checkout/actions", () => ({
  placeOrderAction: placeOrderMock,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsState.value,
}))

vi.mock("@/lib/client", () => ({
  useSession: () => ({ data: null, isPending: false }),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: React.ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <div data-slot="select-stub" data-value={value ?? ""}>
      <button
        type="button"
        data-testid="mock-select-casa"
        onClick={() => onValueChange?.("42")}
      >
        Choisir Casablanca
      </button>
      {children}
    </div>
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

import { CheckoutForm } from "./checkout-form"
import { formatPrice } from "@/lib/money"
import type { ShippingQuote } from "@/lib/use-cases/livraison"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let originalReplaceState: typeof window.history.replaceState

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/checkout")
  searchParamsState.sync(window.location.search)
  placeOrderMock.mockReset()
  originalReplaceState = window.history.replaceState.bind(window.history)
  window.history.replaceState = (data, unused, url) => {
    originalReplaceState(data, unused, url)
    searchParamsState.sync(
      new URL(url ?? window.location.href, window.location.origin).search
    )
  }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  window.history.replaceState = originalReplaceState
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function rerender(element: ReactElement) {
  act(() => roots[roots.length - 1].render(element))
}

function Probe() {
  const { dialog } = useAuthDialogs()
  return <div data-dialog={dialog ?? "none"} />
}

function checkoutHarness() {
  return (
    <AuthDialogsProvider>
      <Probe />
      <CheckoutForm
        cities={[{ id: "42", name: "Casablanca", fee: 2500 }]}
        quotes={{}}
        initialCityId=""
        initialAddress=""
        initialPhone=""
        subtotal={100000}
      />
      <UrlAuthDialog />
    </AuthDialogsProvider>
  )
}

function recapHarness({
  quotes,
  initialCityId,
}: {
  quotes: Record<string, ShippingQuote>
  initialCityId: string | null
}) {
  return (
    <AuthDialogsProvider>
      <CheckoutForm
        cities={[{ id: "42", name: "Casablanca", fee: 2500 }]}
        quotes={quotes}
        initialCityId={initialCityId}
        initialAddress=""
        initialPhone=""
        subtotal={100000}
      />
    </AuthDialogsProvider>
  )
}

function dialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

async function submitForm() {
  container
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function flushDeferredUrlSync() {
  await act(async () => {})
}

describe("CheckoutForm", () => {
  it("opens the Connexion modal over /checkout with ?next=/checkout when the order is refused, leaving the path unchanged", async () => {
    placeOrderMock.mockResolvedValue({ unauthenticated: true })

    render(checkoutHarness())
    await act(async () => submitForm())
    await flushDeferredUrlSync()
    rerender(checkoutHarness())

    expect(placeOrderMock).toHaveBeenCalledTimes(1)
    const url = new URL(window.location.href)
    expect(url.pathname).toBe("/checkout")
    expect(url.searchParams.get("open")).toBe("login")
    expect(url.searchParams.get("next")).toBe("/checkout")
    expect(dialog()).toBe("login")
  })

  it("leaves the URL and dialogs untouched when the order goes through", async () => {
    placeOrderMock.mockResolvedValue({})

    render(checkoutHarness())
    await act(async () => submitForm())
    await flushDeferredUrlSync()

    expect(placeOrderMock).toHaveBeenCalledTimes(1)
    expect(placeOrderMock.mock.calls[0][1]).toBeInstanceOf(FormData)
    expect(new URL(window.location.href).search).toBe("")
    expect(dialog()).toBe("none")
  })

  it("shows « À choisir » without total when no Ville de livraison is selected", () => {
    render(recapHarness({ quotes: {}, initialCityId: null }))

    expect(container.textContent).toContain("À choisir")
    expect(container.textContent).not.toContain("Total à payer à la livraison")
  })

  it("names the Ville de livraison with its fees and total when a ville is selected", () => {
    render(
      recapHarness({
        quotes: { 42: { subtotal: 100000, shippingFee: 2500, total: 102500 } },
        initialCityId: "42",
      })
    )

    expect(container.textContent).toContain("Livraison (Casablanca)")
    expect(container.textContent).toContain(formatPrice(2500))
    expect(container.textContent).toContain("Total à payer à la livraison")
    expect(container.textContent).toContain(formatPrice(102500))
  })

  it("updates the récapitulatif instantly from À choisir to Livraison (Ville) when the city changes, without reload", () => {
    render(
      recapHarness({
        quotes: { 42: { subtotal: 100000, shippingFee: 2500, total: 102500 } },
        initialCityId: null,
      })
    )

    expect(container.textContent).toContain("À choisir")
    expect(container.textContent).not.toContain("Total à payer à la livraison")

    const chooseButton = container.querySelector(
      '[data-testid="mock-select-casa"]',
    )
    expect(chooseButton).not.toBeNull()
    act(() => {
      ;(chooseButton as HTMLButtonElement).click()
    })

    expect(container.textContent).toContain("Livraison (Casablanca)")
    expect(container.textContent).toContain(formatPrice(2500))
    expect(container.textContent).toContain("Total à payer à la livraison")
    expect(container.textContent).toContain(formatPrice(102500))
    expect(new URL(window.location.href).search).toBe("")
  })
})
