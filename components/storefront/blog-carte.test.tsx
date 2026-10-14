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
    sizes,
    fill,
  }: {
    src: string
    alt: string
    className?: string
    sizes?: string
    fill?: boolean
  }) => (
    <img
      data-testid="image-fond"
      src={src}
      alt={alt}
      className={className}
      data-sizes={sizes}
      data-fill={fill ? "true" : undefined}
    />
  ),
}))

import type { CardBlog } from "@/lib/use-cases/blog"

import { BlogFeedCard, BlogHeroCard } from "./blog-carte"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  container.remove()
})

function article(overrides: Partial<CardBlog> = {}): CardBlog {
  return {
    slug: "guide-the-matcha",
    titre: "Guide complet du thé Matcha",
    extrait:
      "Découvrez les bienfaits et la préparation traditionnelle du thé matcha.",
    couverture: "/images/matcha.jpg",
    theme: {
      slug: "guides",
      nom: "Guides & Conseils",
    },
    publishedAt: new Date("2026-03-15T10:00:00Z"),
    ...overrides,
  }
}

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

describe("BlogHeroCard", () => {
  it("conserve la sémantique de lien, le titre h2, le kicker et l'extrait", () => {
    const art = article()
    render(<BlogHeroCard article={art} />)

    const lien = container.querySelector("a")!
    expect(lien).not.toBeNull()
    expect(lien.getAttribute("href")).toBe("/blog/guide-the-matcha")
    expect(lien.getAttribute("aria-label")).toBe(
      "Lire : Guide complet du thé Matcha"
    )

    const heading = container.querySelector("h2")!
    expect(heading).not.toBeNull()
    expect(heading.textContent).toBe("Guide complet du thé Matcha")

    expect(container.textContent).toContain("Guides & Conseils")
    expect(container.textContent).toContain(
      "Découvrez les bienfaits et la préparation traditionnelle du thé matcha."
    )
  })

  it("utilise overflow-clip et applique le feedback tactile actif avec transition amortie sur le lien", () => {
    render(<BlogHeroCard article={article()} />)

    const lien = container.querySelector("a")!
    expect(lien.className).toContain("overflow-clip")
    expect(lien.className).not.toContain("overflow-hidden")
    expect(lien.className).toContain("active:scale-[0.99]")
    expect(lien.className).toContain("motion-safe:transition-transform")
    expect(lien.className).toContain("motion-safe:duration-150")
    expect(lien.className).toContain("motion-safe:ease-out")
    expect(lien.className).toContain("motion-reduce:transition-none")
    expect(lien.className).toContain("motion-reduce:transform-none")
  })

  it("resserre le zoom de l'image de fond à 250ms, le restreint aux pointeurs fins et supporte prefers-reduced-motion", () => {
    render(<BlogHeroCard article={article()} />)

    const img = container.querySelector("[data-testid='image-fond']")!
    expect(img).not.toBeNull()
    expect(img.className).toContain("motion-safe:duration-250")
    expect(img.className).toContain("motion-safe:ease-out")
    expect(img.className).toContain("motion-safe:transition-transform")
    expect(img.className).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.03]"
    )
    expect(img.className).toContain("motion-reduce:transition-none")
    expect(img.className).toContain("motion-reduce:transform-none")
    expect(img.className).not.toContain("duration-500")
  })
})

describe("BlogFeedCard", () => {
  it("conserve la sémantique de lien, le titre h3, le kicker et l'extrait", () => {
    const art = article()
    render(<BlogFeedCard article={art} />)

    const lien = container.querySelector("a")!
    expect(lien).not.toBeNull()
    expect(lien.getAttribute("href")).toBe("/blog/guide-the-matcha")
    expect(lien.getAttribute("aria-label")).toBe(
      "Lire : Guide complet du thé Matcha"
    )

    const heading = container.querySelector("h3")!
    expect(heading).not.toBeNull()
    expect(heading.textContent).toBe("Guide complet du thé Matcha")

    expect(container.textContent).toContain("Guides & Conseils")
    expect(container.textContent).toContain(
      "Découvrez les bienfaits et la préparation traditionnelle du thé matcha."
    )
  })

  it("utilise overflow-clip et applique le feedback tactile actif avec transition amortie sur le lien", () => {
    render(<BlogFeedCard article={article()} />)

    const lien = container.querySelector("a")!
    expect(lien.className).toContain("overflow-clip")
    expect(lien.className).not.toContain("overflow-hidden")
    expect(lien.className).toContain("active:scale-[0.99]")
    expect(lien.className).toContain("motion-safe:transition-transform")
    expect(lien.className).toContain("motion-safe:duration-150")
    expect(lien.className).toContain("motion-safe:ease-out")
    expect(lien.className).toContain("motion-reduce:transition-none")
    expect(lien.className).toContain("motion-reduce:transform-none")
  })

  it("resserre le zoom de l'image de fond à 250ms, le restreint aux pointeurs fins et supporte prefers-reduced-motion", () => {
    render(<BlogFeedCard article={article()} />)

    const img = container.querySelector("[data-testid='image-fond']")!
    expect(img).not.toBeNull()
    expect(img.className).toContain("motion-safe:duration-250")
    expect(img.className).toContain("motion-safe:ease-out")
    expect(img.className).toContain("motion-safe:transition-transform")
    expect(img.className).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.03]"
    )
    expect(img.className).toContain("motion-reduce:transition-none")
    expect(img.className).toContain("motion-reduce:transform-none")
    expect(img.className).not.toContain("duration-500")
  })

  it("fonctionne correctement lorsque l'article n'a pas d'image de couverture", () => {
    render(<BlogFeedCard article={article({ couverture: null })} />)

    expect(container.querySelector("[data-testid='image-fond']")).toBeNull()
    expect(container.textContent).toContain("Guide complet du thé Matcha")
  })
})
