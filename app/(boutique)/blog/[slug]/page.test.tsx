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

import ArticleBlogPage, { generateMetadata } from "./page"

function article(
  contenu: string,
  chapo: string | null = null
): ArticleBlogPublic {
  return {
    id: "article-795",
    titre: "Choisir son casque",
    slug: "choisir-son-casque",
    extrait: "L'extrait de l'article.",
    chapo,
    couverture: null,
    contenu,
    theme: { slug: "guides", nom: "Guides" },
    publishedAt: new Date("2026-10-01T08:00:00.000Z"),
    statut: "publie",
    produits: [],
  }
}

async function rendre(
  contenu: string,
  chapo: string | null = null
): Promise<string> {
  getArticleParSlugMock.mockResolvedValue(article(contenu, chapo))
  const flux = await renderToReadableStream(
    <ArticleBlogPage params={Promise.resolve({ slug: "choisir-son-casque" })} />
  )
  return new Response(flux).text()
}

async function rendreArticle({
  contenu,
  couverture = null,
}: {
  contenu: string
  couverture?: string | null
}): Promise<string> {
  getArticleParSlugMock.mockResolvedValue({ ...article(contenu), couverture })
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

function baliseOuverte(html: string, balise: string): string {
  return html.match(new RegExp(`<${balise}[\\s>][^>]*>`))?.[0] ?? ""
}

function classesDeLaBalise(html: string, balise: string): string[] {
  const classes = baliseOuverte(html, balise).match(/\sclass="([^"]*)"/)?.[1]
  if (!classes) return []
  return classes
    .replaceAll("&amp;", "&")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .split(/\s+/)
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

  it("gradue les Intertitres de 24 px à 21 px, jamais sous le corps, dans la colonne centrale", async () => {
    const html = await rendre(
      "Intro.\n\n## Choisir son écran\n\nUn paragraphe de conseils."
    )

    expect(classesDans(html, "h2", "Choisir son écran")).toEqual(
      expect.arrayContaining([
        "text-[24px]",
        "leading-[1.1667]",
        "tracking-[0.009em]",
        "max-[1068px]:text-[21px]",
        "max-[1068px]:leading-[1.1905]",
        "max-[1068px]:tracking-[0.011em]",
        "md:col-start-2",
      ])
    )
    expect(classesDans(html, "p", "Un paragraphe de conseils.")).toEqual(
      expect.arrayContaining(["md:col-start-2"])
    )
    expect(classesDeLaBalise(html, "article")).toEqual(
      expect.arrayContaining(["text-[19px]", "max-[1068px]:text-body"])
    )
  })

  it("échappe le HTML hostile du Contenu", async () => {
    const html = await rendre("Avant.\n\n<script>alert(1)</script>\n\nAprès.")

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script>alert(1)</script>")
  })
})

describe("Page Article de blog — grille de percée", () => {
  it("pose le masthead dans la colonne centrale, dans l'ordre Thème, date, titre, Extrait", async () => {
    const html = await rendre("Un paragraphe.")
    const entete = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ""

    attendreLOrdre(entete, [
      "Guides",
      "<time",
      "Choisir son casque",
      "L&#x27;extrait de l&#x27;article.",
    ])
    expect(entete).toContain('dateTime="2026-10-01T08:00:00.000Z"')
    expect(classesDeLaBalise(html, "header")).toContain("md:col-start-2")
    expect(classesDeLaBalise(entete, "span")).toEqual(
      expect.arrayContaining(["block", "text-[12px]", "font-bold", "uppercase"])
    )
    expect(classesDeLaBalise(entete, "time")).toEqual(
      expect.arrayContaining(["block", "text-[14px]", "font-semibold"])
    )
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
  })

  it("découpe la page en 980 px avec une mesure de 653 px, des figures sur trois colonnes et le rythme 44/36/32", async () => {
    const html = await rendre("Un paragraphe.")

    const conteneur =
      html.match(/<div class="([^"]*max-w-\[980px\][^"]*)"/)?.[1] ?? ""
    expect(conteneur).toContain("mx-auto")
    expect(conteneur).toContain("w-full")
    expect(conteneur).not.toContain("px-4")

    expect(classesDeLaBalise(html, "article")).toEqual(
      expect.arrayContaining([
        "px-4",
        "sm:px-6",
        "md:px-0",
        "md:grid-cols-[1fr_min(653px,100%)_1fr]",
        "[&>*+*]:mt-[44px]",
        "max-[1068px]:[&>*+*]:mt-[36px]",
        "max-[734px]:[&>*+*]:mt-[32px]",
      ])
    )
  })

  it("pose les paragraphes dans la colonne centrale et leur donne un interligne de paragraphe", async () => {
    const html = await rendre("Un paragraphe.\n\nUn autre paragraphe.")

    expect(classesDans(html, "p", "Un paragraphe.")).toEqual(
      expect.arrayContaining(["md:col-start-2"])
    )
    expect(classesDeLaBalise(html, "article")).toEqual(
      expect.arrayContaining([
        "[&>p+p]:mt-[1.4211em]",
        "max-[1068px]:[&>p+p]:mt-[1.471em]",
      ])
    )
  })
})

describe("Page Article de blog — figures", () => {
  it("rend une figure du corps avec son alt et sa légende revenue à la mesure", async () => {
    const html = await rendreArticle({
      contenu:
        '![Un casque posé sur un bureau](/images/casque.webp "Le casque du guide")',
    })

    expect(html).toContain('data-image-src="/images/casque.webp"')
    expect(html).toContain('aria-label="Un casque posé sur un bureau"')
    expect(html).toMatch(/<figcaption[^>]*>Le casque du guide<\/figcaption>/)
    const figure = baliseOuverte(html, "figure")
    expect(figure).toContain("-mx-4")
    expect(figure).toContain("sm:-mx-6")
    expect(figure).toContain("md:col-span-3")
    expect(figure).toContain("md:mx-0")

    const cadre = html.match(/<div class="[^"]*aspect-video[^"]*"/)?.[0] ?? ""
    expect(cadre).toContain("rounded-[10px]")
    expect(cadre).toContain("bg-muted")

    const legende = html.match(/<figcaption[^>]*>/)?.[0] ?? ""
    expect(legende).toContain("w-[87.5%]")
    expect(legende).toContain("md:max-w-[653px]")
    expect(legende).toContain("text-[12px]")
    expect(legende).toContain("font-semibold")
    expect(legende).toContain("text-muted-foreground")
  })

  it("n'affiche pas de légende sous une figure sans titre Markdown", async () => {
    const html = await rendreArticle({
      contenu: "![Un casque sans titre](/images/casque.webp)",
    })

    expect(html).toContain('aria-label="Un casque sans titre"')
    expect(html).not.toContain("<figcaption")
  })

  it("rend la couverture en première figure, à la largeur de la grille et avec un alt vide", async () => {
    const html = await rendreArticle({
      contenu:
        'Un paragraphe.\n\n![Un casque](/images/casque.webp "Le casque")',
      couverture: "/images/couverture.webp",
    })
    const corps = html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? ""
    const figures = [...corps.matchAll(/<figure[\s\S]*?<\/figure>/g)].map(
      ([figure]) => figure
    )

    expect(figures).toHaveLength(2)
    expect(figures[0]).toContain("couverture.webp")
    expect(figures[1]).toContain("casque.webp")
    expect(figures[0]).toContain("md:col-span-3")
    expect(figures[0]).toMatch(
      /<span data-image-src="\/images\/couverture\.webp" aria-label=""><\/span>/
    )
  })
})

describe("Page Article de blog — Chapô", () => {
  const chapo = "Le bon choix tient à trois questions."
  const extrait = "L&#x27;extrait de l&#x27;article."
  const classesDuChapo = [
    "text-[24px]",
    "leading-[1.1667]",
    "font-medium",
    "tracking-[0.009em]",
    "text-foreground",
    "max-[1068px]:text-[21px]",
    "max-[1068px]:leading-[1.1905]",
    "max-[1068px]:tracking-[0.011em]",
  ]

  it("affiche le Chapô sous le titre, à la place de l'Extrait", async () => {
    const html = await rendre("Un paragraphe.", chapo)
    const entete = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ""

    attendreLOrdre(entete, ["Choisir son casque", chapo])
    expect(classesDans(html, "p", chapo)).toEqual(
      expect.arrayContaining(classesDuChapo)
    )
    expect(classesDans(html, "p", chapo)).not.toContain("text-muted-foreground")
    expect(entete).not.toContain(extrait)
  })

  it("affiche l'Extrait à la même place quand l'Article n'a pas de Chapô", async () => {
    const html = await rendre("Un paragraphe.")
    const entete = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ""

    attendreLOrdre(entete, ["Choisir son casque", extrait])
    expect(classesDans(html, "p", extrait)).toEqual(
      expect.arrayContaining(classesDuChapo)
    )
  })

  it("garde l'Extrait comme description de la page dans les deux cas", async () => {
    getArticleParSlugMock.mockResolvedValue(article("Un paragraphe.", chapo))
    const avecChapo = await generateMetadata({
      params: Promise.resolve({ slug: "choisir-son-casque" }),
    })

    getArticleParSlugMock.mockResolvedValue(article("Un paragraphe."))
    const sansChapo = await generateMetadata({
      params: Promise.resolve({ slug: "choisir-son-casque" }),
    })

    expect(avecChapo.description).toBe("L'extrait de l'article.")
    expect(sansChapo.description).toBe("L'extrait de l'article.")
    expect(avecChapo.openGraph?.description).toBe("L'extrait de l'article.")
    expect(sansChapo.openGraph?.description).toBe("L'extrait de l'article.")
  })
})
