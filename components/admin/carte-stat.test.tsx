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

  it("donne au héros le chiffre d'affichage et au bandeau un chiffre secondaire", async () => {
    const html = await rendre(
      <>
        <CarteStat
          variant="hero"
          label="Chiffre d'affaires net"
          value="15.998,00 MAD"
          valueClassName={VALEUR_MONETAIRE}
          hint="Brut : 18.000,00 MAD"
          legende="30 derniers jours"
          icon={PackageIcon}
        />
        <CarteStat
          variant="chiffre"
          label="Produits"
          value={7}
          href="/admin/produits"
          action="Produits : 7 — voir les produits"
        />
      </>
    )

    expect(html).toContain("var(--text-hero,clamp(1.5rem,10.5cqi,3.5rem))")
    expect(html).toContain("var(--text-chiffre,clamp(1rem,5cqi,1.75rem))")
    expect(html).toContain("@container")
  })

  it("isole le montant du héros dans un seul paragraphe et met la légende à côté", async () => {
    const html = await rendre(
      <CarteStat
        variant="hero"
        label="Chiffre d'affaires net"
        value="15.998,00 MAD"
        valueClassName={VALEUR_MONETAIRE}
        hint="Brut : 18.000,00 MAD"
        legende="30 derniers jours"
        icon={PackageIcon}
      />
    )

    expect(html.match(/<p[^>]*>15\.998,00 MAD<\/p>/g)).toHaveLength(1)
    expect(html).toContain(">30 derniers jours</p>")
  })
})
