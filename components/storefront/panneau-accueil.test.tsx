// @vitest-environment happy-dom

import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) => (
    <span
      data-testid="image-produit"
      data-src={src}
      data-alt={alt}
      className={className}
    />
  ),
}))

vi.mock("@/components/storefront/apparition-panneau", () => ({
  ApparitionPanneau: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    render: _render,
    ...props
  }: {
    children: React.ReactNode
    render?: React.ReactNode
  }) => <button {...props}>{children}</button>,
}))

import {
  PanneauDuo,
  PanneauPleineLargeur,
} from "@/components/storefront/panneau-accueil"
import type { PanneauProduit } from "@/lib/accueil-panneaux"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
  return root
}

function panneau(overrides: Partial<PanneauProduit> = {}): PanneauProduit {
  return {
    produit: {
      id: "panneau-produit",
      name: "iPhone 18 Pro Max",
      slug: "iphone-18-pro-max",
      brand: "Apple",
      image: "/hero.jpg",
      minPrice: 3688790,
      totalStock: 2,
      freeShipping: false,
    },
    href: "/produit/iphone-18-pro-max",
    titre: "iPhone 18 Pro Max",
    surtitre: "Apple",
    callout: "Dès 36 887,90 MAD",
    ...overrides,
  }
}

function image() {
  return container.querySelector<HTMLElement>("[data-testid='image-produit']")!
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
})

describe("PanneauPleineLargeur", () => {
  it("porte le titre du premier Panneau en h1, et celui du suivant en h2", () => {
    const root = render(
      <PanneauPleineLargeur panneau={panneau()} champ="muted" premier />
    )

    expect(container.querySelector("h1")?.textContent).toBe("iPhone 18 Pro Max")
    expect(container.querySelector("h2")).toBeNull()

    act(() =>
      root.render(<PanneauPleineLargeur panneau={panneau()} champ="muted" />)
    )

    expect(container.querySelector("h1")).toBeNull()
    expect(container.querySelector("h2")?.textContent).toBe("iPhone 18 Pro Max")
  })

  it("garde le recadrage mobile et montre le Produit entier sur ordinateur", () => {
    render(<PanneauPleineLargeur panneau={panneau()} champ="muted" premier />)

    const classes = image().className
    expect(classes).toContain("object-cover")
    expect(classes).toContain("object-bottom")
    expect(classes).toContain("lg:object-contain")
    expect(classes).toContain("lg:object-center")
    expect(classes).toContain("lg:mix-blend-multiply")
  })

  it("ne fond pas l'art d'un champ noir dans le fond de la page", () => {
    render(<PanneauPleineLargeur panneau={panneau()} champ="noir" />)

    const classes = image().className
    expect(classes).toContain("lg:object-contain")
    expect(classes).not.toContain("lg:mix-blend-multiply")
  })

  it("garde le cadrage rapproché du Panneau en duo", () => {
    render(<PanneauDuo panneau={panneau()} champ="muted" />)

    const classes = image().className
    expect(classes).toContain("object-cover")
    expect(classes).toContain("object-bottom")
    expect(classes).not.toContain("lg:object-contain")
  })
})
