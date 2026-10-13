// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

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

function groupe() {
  return (
    <Accordion>
      <AccordionItem value="marque">
        <AccordionTrigger>Marque</AccordionTrigger>
        <AccordionContent>Contenu du groupe</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function declencheur(): HTMLElement {
  return container.querySelector<HTMLElement>(
    '[data-slot="accordion-trigger"]'
  )!
}

function chevrons(): HTMLElement[] {
  return [
    ...declencheur().querySelectorAll<HTMLElement>(
      '[data-slot="accordion-trigger-icon"]'
    ),
  ]
}

function classesDesChevrons(): string[] {
  return chevrons().flatMap((chevron) =>
    (chevron.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
  )
}

function panneau(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-slot="accordion-content"]')
}

async function basculer() {
  await act(async () => {
    declencheur().click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("AccordionTrigger", () => {
  it("ne rend qu'un seul chevron au lieu de deux flèches contraires", () => {
    render(groupe())

    expect(chevrons()).toHaveLength(1)
  })

  it("n'écrit la rotation du chevron que sous prefers-reduced-motion: no-preference", () => {
    render(groupe())

    const rotations = classesDesChevrons().filter((classe) =>
      classe.includes("rotate-180")
    )
    expect(rotations).not.toHaveLength(0)
    for (const classe of rotations) {
      const variantes = classe.split(":")
      expect(variantes[variantes.length - 2]).toBe("motion-safe")
    }
  })

  it("ouvre et ferme le groupe : aria-expanded bascule et le panneau suit", async () => {
    render(groupe())
    expect(declencheur().getAttribute("aria-expanded")).toBe("false")
    expect(panneau()).toBeNull()

    await basculer()
    expect(declencheur().getAttribute("aria-expanded")).toBe("true")
    expect(panneau()?.textContent).toBe("Contenu du groupe")

    await basculer()
    expect(declencheur().getAttribute("aria-expanded")).toBe("false")
    expect(panneau()).toBeNull()
  })
})
