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
    name,
    required,
  }: {
    children?: React.ReactNode
    onValueChange?: (value: string) => void
    value?: string
    name?: string
    required?: boolean
  }) => (
    <div
      data-slot="select-stub"
      data-value={value ?? ""}
      data-required={required ? "true" : "false"}
    >
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
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
import type { Devis, SelectionDevis } from "@/lib/use-cases/devis-selection"
import type { ShippingQuote } from "@/lib/use-cases/livraison-prix"

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

const CASA = { id: "42", name: "Casablanca", fee: 2500 }
const QUOTE_CASA: ShippingQuote = {
  subtotal: 100000,
  shippingFee: 2500,
  total: 102500,
}

/**
 * Fixture minimale : un Devis déjà résolu, jamais re-dérivé ici —
 * les faits du formulaire uniquement, la re-sélection vit dans
 * `lib/use-cases/devis-selection.test.tsx`.
 */
function devisPourTest({
  selection,
  quotes,
}: {
  selection: SelectionDevis
  quotes: Record<string, ShippingQuote>
}): Devis {
  const cities = [CASA]
  return {
    cities,
    threshold: 100000,
    quotes,
    sousTotal: 100000,
    ...selection,
  }
}

function selectValue() {
  return container
    .querySelector('[data-slot="select-stub"]')
    ?.getAttribute("data-value")
}

function checkoutHarness() {
  return (
    <AuthDialogsProvider>
      <Probe />
      <CheckoutForm
        devis={devisPourTest({ selection: { cas: "aucune" }, quotes: {} })}
        initialAddress=""
        initialPhone=""
      />
      <UrlAuthDialog />
    </AuthDialogsProvider>
  )
}

function formHarness({
  quotes,
  selection,
}: {
  quotes: Record<string, ShippingQuote>
  selection: SelectionDevis
}) {
  return (
    <AuthDialogsProvider>
      <CheckoutForm
        devis={devisPourTest({ selection, quotes })}
        initialAddress=""
        initialPhone=""
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
  it("exige la ville, l'adresse et le téléphone avant soumission", () => {
    render(checkoutHarness())

    expect(
      container
        .querySelector('[data-slot="select-stub"]')
        ?.getAttribute("data-required")
    ).toBe("true")

    const address = container.querySelector<HTMLInputElement>(
      "#checkout-address"
    )!
    expect(address.required).toBe(true)
    expect(address.getAttribute("minlength")).toBe("5")

    const phone =
      container.querySelector<HTMLInputElement>("#checkout-phone")!
    expect(phone.required).toBe(true)
    expect(phone.getAttribute("minlength")).toBe("8")
  })

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

  it("posts the currently selected city on submit", async () => {
    placeOrderMock.mockResolvedValue({})

    render(
      formHarness({
        quotes: { 42: QUOTE_CASA },
        selection: { cas: "aucune" },
      })
    )

    const chooseButton = container.querySelector(
      '[data-testid="mock-select-casa"]',
    )
    act(() => {
      ;(chooseButton as HTMLButtonElement).click()
    })
    expect(selectValue()).toBe("42")

    await act(async () => submitForm())

    expect(placeOrderMock).toHaveBeenCalledTimes(1)
    const formData = placeOrderMock.mock.calls[0][1] as FormData
    expect(formData.get("cityId")).toBe("42")
  })
})
