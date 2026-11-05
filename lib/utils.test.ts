import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils"

describe("cn — les tailles maison ne mangent plus les couleurs", () => {
  it("garde la couleur du Bouton quand une taille maison arrive par-dessus", () => {
    expect(cn("bg-primary text-primary-foreground", "text-body")).toBe(
      "bg-primary text-primary-foreground text-body"
    )
  })

  it("garde la couleur du Bouton quand elle arrive après la taille", () => {
    expect(cn("text-body", "bg-primary text-primary-foreground")).toBe(
      "text-body bg-primary text-primary-foreground"
    )
  })

  it.each(["text-titre-carte", "text-titre-catalogue"])(
    "lit %s comme une taille, pas comme une couleur",
    (taille) => {
      expect(cn("text-primary-foreground", taille)).toBe(
        `text-primary-foreground ${taille}`
      )
    }
  )

  it("laisse la dernière taille gagner, même contre une taille de Tailwind", () => {
    expect(cn("text-sm", "text-body")).toBe("text-body")
    expect(cn("text-body", "text-sm")).toBe("text-sm")
  })

  it("laisse la dernière taille maison gagner", () => {
    expect(cn("text-titre-carte", "text-body")).toBe("text-body")
    expect(cn("text-body", "text-titre-catalogue")).toBe("text-titre-catalogue")
  })

  it("laisse la dernière couleur gagner", () => {
    expect(cn("text-primary-foreground", "text-link")).toBe("text-link")
  })
})
