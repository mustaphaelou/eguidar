// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GlobalNavBar } from "./global-nav-bar"

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

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
const actWarnings = [
  "An update to Root inside a test was not wrapped in act(...)",
]

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function renderCapturingErrors(element: ReactElement) {
  const errors: string[] = []
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.join(" "))
  })
  render(element)
  return errors.filter(
    (error) => !actWarnings.some((warning) => error.includes(warning))
  )
}

const links = [
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
]

describe("GlobalNavBar", () => {
  it("renders the brand, links and server-rendered actions", () => {
    const errors = renderCapturingErrors(
      <GlobalNavBar links={links} actions={<span>actions</span>} />
    )

    const home = container.querySelector<HTMLAnchorElement>("a[href='/']")!
    expect(home.getAttribute("aria-label")).toBe("eguidar.com — Accueil")
    const logo = home.querySelector<HTMLImageElement>("img")!
    expect(logo.getAttribute("src")).toBe("/brand/eguidar-logo.svg")
    expect(logo.getAttribute("width")).toBe("1352")
    expect(logo.getAttribute("height")).toBe("442")
    expect(logo.getAttribute("alt")).toBe("eguidar.com")

    expect(container.textContent).toContain("À propos")
    expect(container.textContent).toContain("Contact")
    expect(container.textContent).toContain("actions")
    expect(errors).toEqual([])
  })

  it("opens the search flyout with the toggle and closes it on Escape", () => {
    renderCapturingErrors(<GlobalNavBar links={links} actions={null} />)

    const toggle = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Rechercher']"
    )!
    act(() => toggle.click())

    const input = container.querySelector<HTMLInputElement>("input[name='q']")
    expect(input).not.toBeNull()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    expect(container.querySelector("input[name='q']")).toBeNull()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("opens and closes the mobile menu", () => {
    renderCapturingErrors(<GlobalNavBar links={links} actions={null} />)

    const menu = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Menu']"
    )!
    act(() => menu.click())
    expect(
      container.querySelector("nav[aria-label='Menu mobile']")
    ).not.toBeNull()

    act(() => menu.click())
    expect(container.querySelector("nav[aria-label='Menu mobile']")).toBeNull()
  })

  it("renders the panier link without a badge by default", () => {
    renderCapturingErrors(<GlobalNavBar links={links} actions={null} />)

    const panier =
      container.querySelector<HTMLAnchorElement>("a[href='/panier']")!
    expect(panier.getAttribute("aria-label")).toBe("Panier")
    expect(panier.textContent).toBe("")
  })

  it("renders the streamed panier badge inside the panier link", () => {
    renderCapturingErrors(
      <GlobalNavBar
        links={links}
        actions={null}
        panierBadge={<span data-testid="badge">3</span>}
      />
    )

    const panier =
      container.querySelector<HTMLAnchorElement>("a[href='/panier']")!
    const badge = panier.querySelector<HTMLElement>("[data-testid='badge']")!
    expect(badge.textContent).toBe("3")
  })
})
