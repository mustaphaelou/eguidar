import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { StorefrontFooter } from "./footer"

describe("StorefrontFooter — les pages de la boutique", () => {
  it("rend les cinq entrées que le Bandeau ne porte plus", async () => {
    const flux = await renderToReadableStream(<StorefrontFooter />)
    await flux.allReady
    const html = await new Response(flux).text()

    for (const page of [
      "/a-propos",
      "/contact",
      "/faq",
      "/blog",
      "/conditions",
    ]) {
      expect(html).toContain(`href="${page}"`)
    }
    expect(html).toContain("À propos")
    expect(html).toContain("Conditions &amp; livraison")
  })
})
