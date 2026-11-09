import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { PackageIcon } from "@hugeicons/core-free-icons"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    ...props
  }: {
    href: string
    children: React.ReactNode
    scroll?: boolean
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { CarteStat, VALEUR_MONETAIRE } from "./carte-stat"

async function rendre(element: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element)
  return new Response(stream).text()
}

describe("la carte d'indicateur", () => {
  it("fait de la valeur le nom accessible de la carte entière", async () => {
    const html = await rendre(
      <CarteStat
        label="Produits"
        value={7}
        hint="Produits au catalogue"
        icon={PackageIcon}
        href="/admin/produits"
        action="Voir les produits"
      />
    )

    expect(html).toContain('href="/admin/produits"')
    expect(html).toContain('aria-label="Voir les produits"')
    expect(html).toContain(">7</a>")
  })

  it("porte le retour d'appui à 0,97 sur 160 ms, et rien sous mouvement réduit", async () => {
    const html = await rendre(
      <CarteStat
        label="Produits"
        value={7}
        hint="Produits au catalogue"
        icon={PackageIcon}
        href="/admin/produits"
        action="Voir les produits"
      />
    )

    expect(html).toContain("motion-safe:has-[:active]:scale-[0.97]")
    expect(html).toContain("motion-safe:duration-[160ms]")
    expect(html).toContain("motion-safe:ease-out")
    expect(html).not.toContain("motion-reduce:scale")
  })

  it("ne laisse le survol qu'à un pointeur fin", async () => {
    const html = await rendre(
      <CarteStat
        label="Produits"
        value={7}
        hint="Produits au catalogue"
        icon={PackageIcon}
        href="/admin/produits"
        action="Voir les produits"
      />
    )

    expect(html).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:hover:underline"
    )
  })

  it("laisse les comptes en deux crans et plafonne l'argent à 1,25 rem", async () => {
    const html = await rendre(
      <>
        <CarteStat
          label="Produits"
          value={7}
          hint="Produits au catalogue"
          icon={PackageIcon}
        />
        <CarteStat
          label="CA encaissé"
          value="15 998,00 MAD"
          valueClassName={VALEUR_MONETAIRE}
          hint="Pas encore de comparaison"
          icon={PackageIcon}
        />
      </>
    )

    expect(html).toContain("text-xl sm:text-2xl")
    expect(html).toContain("clamp(0.5rem,10.5cqi,1.25rem)")
    expect(html).toContain("@container")
  })
})
