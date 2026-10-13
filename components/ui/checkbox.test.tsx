// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Checkbox } from "./checkbox"

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

function rendre(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function caseACocher(): HTMLElement {
  return container.querySelector<HTMLElement>('[data-slot="checkbox"]')!
}

describe("Checkbox", () => {
  it("garde son rôle de case à cocher quand on la rend seule", () => {
    rendre(<Checkbox aria-label="Sélection" />)

    expect(caseACocher().getAttribute("role")).toBe("checkbox")
  })

  it("ne se masque pas elle-même : c'est l'appelant qui décide de la masquer", () => {
    rendre(<Checkbox aria-label="Sélection" />)

    expect(caseACocher().className.split(/\s+/)).not.toContain("sr-only")
  })

  it("n'a pas d'indicateur au repos", () => {
    rendre(<Checkbox aria-label="Sélection" />)

    expect(
      caseACocher().querySelector('[data-slot="checkbox-indicator"]')
    ).toBeNull()
  })

  it("montre la coche de son état coché", () => {
    rendre(<Checkbox aria-label="Sélection" defaultChecked />)

    expect(
      caseACocher().querySelector('[data-slot="checkbox-indicator"]')
    ).not.toBeNull()
  })
})
