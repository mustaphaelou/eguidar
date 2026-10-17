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
  default: ({ alt }: { alt: string }) => (
    <div data-testid="image-produit" data-alt={alt} />
  ),
}))

import type {
  ArticleDuPanier as ArticleDuPanierDonnees,
  ResultatPanier,
} from "@/lib/panier"
import { formatPrice } from "@/lib/money"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

import { ArticleDuPanier } from "./article-du-panier"

const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

function article(
  overrides: Partial<ArticleDuPanierDonnees> = {}
): ArticleDuPanierDonnees {
  return {
    variantId: "variante-x",
    variantName: "Standard",
    productId: "produit-1",
    productName: "Théière traditionnelle",
    productSlug: "theiere-traditionnelle",
    image: null,
    unitPrice: 100000,
    quantity: 2,
    lineTotal: 200000,
    stock: 9,
    freeShipping: false,
    ...overrides,
  }
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
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

function bouton(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.getAttribute("aria-label") === label
  )!
}

async function rejouerTransition() {
  await act(async () => {})
  await act(async () => {})
}

function cliquer(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
  })
}

function evenementPointeur(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
  })
}

function poserDoigtSur(cible: Element, x: number, y: number) {
  act(() => cible.dispatchEvent(evenementPointeur("pointerdown", x, y)))
}

function deplacerDoigtSur(cible: Element, x: number, y: number) {
  act(() => cible.dispatchEvent(evenementPointeur("pointermove", x, y)))
}

function relacherDoigtSur(cible: Element, x: number, y: number) {
  act(() => cible.dispatchEvent(evenementPointeur("pointerup", x, y)))
}

function quantite() {
  return bouton("Diminuer la quantité").nextElementSibling?.textContent ?? ""
}

describe("ArticleDuPanier", () => {
  it("hands the Variante identity of the displayed Article to the quantity edit", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 3 },
    ])
  })

  it("hands the Variante identity to the removal write", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "retirer", variantId: "variante-x" },
    ])
  })

  it("asks for quantity - 1 on decrease", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Diminuer la quantité"))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 1 },
    ])
  })

  it("locks the decrease at quantity 1 and writes nothing below it", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article({ quantity: 1 })} port={port} />)

    const diminuer = bouton("Diminuer la quantité")
    expect(diminuer.disabled).toBe(true)
    cliquer(diminuer)
    await rejouerTransition()

    expect(port.appels).toEqual([])
  })

  it("surfaces the article-inconnu refusal inline in the alert", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }))
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Retirer du panier"))
    await rejouerTransition()

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )
  })

  it("surfaces the variante-inconnue refusal inline in the alert", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "variante-inconnue",
      message: MESSAGE_VARIANTE_INCONNUE,
    }))
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()

    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_VARIANTE_INCONNUE
    )
  })

  it("clears the refusal on the next operation on the same Article du panier", async () => {
    let refuser = true
    const port = creerPortPanierEnMemoire(() =>
      refuser
        ? {
            ok: false,
            motif: "article-inconnu",
            message: MESSAGE_ARTICLE_INCONNU,
          }
        : { ok: true }
    )
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )

    refuser = false
    cliquer(bouton("Augmenter la quantité"))
    await rejouerTransition()

    expect(container.querySelector("[role='alert']")).toBeNull()
    expect(port.appels).toHaveLength(2)
  })

  it("moves the number on pointer-down, before the write resolves", async () => {
    let resoudre!: (resultat: ResultatPanier) => void
    const port = creerPortPanierEnMemoire((appel) =>
      appel.operation === "modifier"
        ? new Promise<ResultatPanier>((resolve) => {
            resoudre = resolve
          })
        : { ok: true }
    )
    render(<ArticleDuPanier article={article()} port={port} />)

    poserDoigtSur(bouton("Augmenter la quantité"), 100, 100)

    expect(quantite()).toBe("3")
    expect(port.appels).toEqual([])

    cliquer(bouton("Augmenter la quantité"))

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 3 },
    ])
    expect(quantite()).toBe("3")

    act(() => resoudre({ ok: true }))
    await rejouerTransition()
  })

  it("coalesces rapid presses into one flight, the newest quantity carried", async () => {
    const resoudre: ((resultat: ResultatPanier) => void)[] = []
    const port = creerPortPanierEnMemoire((appel) =>
      appel.operation === "modifier"
        ? new Promise<ResultatPanier>((resolve) => {
            resoudre.push(resolve)
          })
        : { ok: true }
    )
    render(<ArticleDuPanier article={article()} port={port} />)

    cliquer(bouton("Augmenter la quantité"))
    cliquer(bouton("Augmenter la quantité"))
    cliquer(bouton("Augmenter la quantité"))

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 3 },
    ])
    expect(quantite()).toBe("5")

    act(() => resoudre[0]!({ ok: true }))
    await rejouerTransition()

    expect(port.appels).toEqual([
      { operation: "modifier", variantId: "variante-x", quantity: 3 },
      { operation: "modifier", variantId: "variante-x", quantity: 5 },
    ])

    act(() => resoudre[1]!({ ok: true }))
    await rejouerTransition()

    expect(port.appels).toHaveLength(2)
    expect(quantite()).toBe("5")
  })

  it("puts the number back when a modifier is refused", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }))
    render(<ArticleDuPanier article={article()} port={port} />)

    poserDoigtSur(bouton("Augmenter la quantité"), 100, 100)
    cliquer(bouton("Augmenter la quantité"))
    expect(quantite()).toBe("3")

    await rejouerTransition()

    expect(quantite()).toBe("2")
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )
  })

  it("cancels the press preview when the finger leaves the control", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    const augmenter = bouton("Augmenter la quantité")
    poserDoigtSur(augmenter, 100, 100)
    expect(quantite()).toBe("3")

    deplacerDoigtSur(augmenter, 140, 100)
    expect(quantite()).toBe("2")
    relacherDoigtSur(augmenter, 140, 100)

    await rejouerTransition()
    expect(port.appels).toEqual([])
  })

  it("swipes the row left and hands the Variante to the removal write", async () => {
    const port = creerPortPanierEnMemoire()
    const retires: string[] = []
    render(
      <ArticleDuPanier
        article={article()}
        port={port}
        onRetire={(retire) => retires.push(retire.variantId)}
      />
    )

    const ligne = container.querySelector("li")!
    poserDoigtSur(ligne, 200, 100)
    deplacerDoigtSur(ligne, 140, 100)
    relacherDoigtSur(ligne, 140, 100)
    await rejouerTransition()

    expect(retires).toEqual(["variante-x"])
    expect(port.appels).toEqual([
      { operation: "retirer", variantId: "variante-x" },
    ])
  })

  it("lets a control keep its press instead of swiping the row", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    const ligne = container.querySelector("li")!
    const augmenter = bouton("Augmenter la quantité")
    poserDoigtSur(augmenter, 200, 100)
    deplacerDoigtSur(augmenter, 140, 100)
    relacherDoigtSur(ligne, 140, 100)
    await rejouerTransition()

    expect(port.appels).toEqual([])
    expect(quantite()).toBe("2")
  })

  it("brings the row back when the swipe's removal is refused", async () => {
    const port = creerPortPanierEnMemoire(() => ({
      ok: false,
      motif: "article-inconnu",
      message: MESSAGE_ARTICLE_INCONNU,
    }))
    const retours: string[] = []
    render(
      <ArticleDuPanier
        article={article()}
        port={port}
        onRetour={(retour) => retours.push(retour.variantId)}
      />
    )

    const ligne = container.querySelector("li")!
    poserDoigtSur(ligne, 200, 100)
    deplacerDoigtSur(ligne, 140, 100)
    relacherDoigtSur(ligne, 140, 100)
    await rejouerTransition()

    expect(retours).toEqual(["variante-x"])
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      MESSAGE_ARTICLE_INCONNU
    )
    expect(bouton("Augmenter la quantité").disabled).toBe(false)
  })

  it("equips stepper buttons with tactile press feedback and motion buffer classes without abrupt scale-90", async () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)
    await rejouerTransition()

    const diminuer = bouton("Diminuer la quantité")
    const augmenter = bouton("Augmenter la quantité")

    const expectedClasses = [
      "motion-safe:active:scale-[0.96]",
      "motion-safe:transition-transform",
      "motion-safe:duration-150",
      "motion-safe:ease-out",
      "motion-reduce:transition-none",
      "motion-reduce:transform-none",
      "disabled:active:scale-100",
    ]

    for (const boutonElement of [diminuer, augmenter]) {
      expect(boutonElement.className).not.toContain("active:scale-90")
      for (const cls of expectedClasses) {
        expect(boutonElement.className).toContain(cls)
      }
    }
  })

  it("stacks the row on a phone, keeping the line total grouped with the stepper", () => {
    const port = creerPortPanierEnMemoire()
    render(<ArticleDuPanier article={article()} port={port} />)

    const ligne = container.querySelector("li")!
    const ligneDuHaut = ligne.querySelector("div.flex-col")!
    const stepper = bouton("Diminuer la quantité").parentElement!
    const prix = stepper.querySelector("p")!

    expect(ligneDuHaut.className).toContain("flex-col")
    expect(ligneDuHaut.className).toContain("sm:flex-row")
    expect(stepper.contains(prix)).toBe(true)
    expect(prix.className).toContain("ms-auto")
    expect(prix.textContent).toBe(formatPrice(200000))

    const image = ligne.querySelector("a .relative")!
    const nom = ligne.querySelector("a.line-clamp-2")!
    expect(ligneDuHaut.contains(image)).toBe(true)
    expect(ligneDuHaut.contains(nom)).toBe(true)
    expect(
      image.closest("div.flex.min-w-0") === nom.closest("div.flex.min-w-0")
    ).toBe(true)

    const retirer = bouton("Retirer du panier")
    expect(retirer.className).toContain("shrink-0")
    expect(ligneDuHaut.contains(retirer)).toBe(true)
  })
})
