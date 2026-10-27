import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getArticleParSlugMock } = vi.hoisted(() => ({
  getArticleParSlugMock: vi.fn(),
}))

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
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

vi.mock("@/lib/use-cases/blog", () => ({
  getArticleParSlug: getArticleParSlugMock,
  parametresDesArticles: vi.fn(async () => []),
}))

import type { ArticleBlogPublic } from "@/lib/use-cases/blog"

import ArticleBlogPage from "./page"

function article(contenu: string): ArticleBlogPublic {
  return {
    id: "article-795",
    titre: "Choisir son casque",
    slug: "choisir-son-casque",
    extrait: "L'extrait de l'article.",
    couverture: null,
    contenu,
    theme: { slug: "guides", nom: "Guides" },
    publishedAt: new Date("2026-10-01T08:00:00.000Z"),
    statut: "publie",
    produits: [],
  }
}

async function rendre(contenu: string): Promise<string> {
  getArticleParSlugMock.mockResolvedValue(article(contenu))
  const flux = await renderToReadableStream(
    <ArticleBlogPage params={Promise.resolve({ slug: "choisir-son-casque" })} />
  )
  return new Response(flux).text()
}

function classesDans(html: string, balise: string, texte: string): string[] {
  const motif = new RegExp(
    `<${balise}[^>]*\\sclass="([^"]*)"[^>]*>${texte}</${balise}>`
  )
  const classes = html.match(motif)?.[1]
  return classes ? classes.split(/\s+/) : []
}

function attendreLOrdre(html: string, reperes: string[]) {
  for (const repere of reperes) expect(html, repere).toContain(repere)
  const positions = reperes.map((repere) => html.indexOf(repere))
  for (let index = 1; index < positions.length; index++) {
    expect(positions[index], reperes[index]).toBeGreaterThan(
      positions[index - 1]
    )
  }
}

beforeEach(() => {
  getArticleParSlugMock.mockReset()
})

describe("Page Article de blog — Fragments d'article", () => {
  it("rend les cinq Fragments dans l'ordre du Contenu", async () => {
    const html = await rendre(
      [
        "Le casque se choisit avant tout avec les oreilles.",
        "",
        "## Les critères à regarder",
        "",
        '![Un casque posé sur un bureau](/images/casque.webp "Le casque du guide")',
        "",
        "- Autonomie",
        "- Poids",
        "",
        "> Un casque qui se fait oublier.",
        "",
        "La ville change le prix.",
      ].join("\n")
    )

    attendreLOrdre(html, [
      "Le casque se choisit avant tout avec les oreilles.",
      ">Les critères à regarder</h2>",
      "Un casque posé sur un bureau",
      "Le casque du guide",
      "Autonomie",
      "Poids",
      "Un casque qui se fait oublier.",
      "La ville change le prix.",
    ])
  })

  it("rend le corpus historique avec les classes d'avant", async () => {
    const html = await rendre(
      "Intro.\n\n## Choisir son écran\n\nUn paragraphe de conseils."
    )

    expect(classesDans(html, "h2", "Choisir son écran")).toEqual(
      expect.arrayContaining([
        "mt-11",
        "text-[21px]",
        "leading-[1.1905]",
        "sm:text-[24px]",
      ])
    )
    expect(classesDans(html, "p", "Un paragraphe de conseils.")).toEqual(
      expect.arrayContaining(["mt-6", "whitespace-pre-line", "first:mt-0"])
    )
  })

  it("échappe le HTML hostile du Contenu", async () => {
    const html = await rendre("Avant.\n\n<script>alert(1)</script>\n\nAprès.")

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script>alert(1)</script>")
  })
})
