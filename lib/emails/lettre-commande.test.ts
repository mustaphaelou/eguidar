import { describe, expect, it } from "vitest"

import { site, staticPages } from "@/lib/site"

import type { ClientEmails } from "./adaptateur-envoi"
import { commandeStandard } from "./exemples"
import { html } from "./gabarit"
import { sendOrderPlacedEmail } from "./index"

interface AppelEmail {
  payload: {
    from: string
    to: string
    subject: string
    html: string
    text: string
  }
  options?: { idempotencyKey?: string }
}

function clientEnMemoire() {
  const appels: AppelEmail[] = []
  const client: ClientEmails = {
    emails: {
      async send(payload, options) {
        appels.push({ payload, options })
        return { id: "double-en-memoire" }
      },
    },
  }
  return { client, appels }
}

describe("Lettre de commande reçue", () => {
  it("part au Client avec le sujet, la Clé d'idempotence et une lettre complète", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(commandeStandard, undefined, client)

    expect(appels).toHaveLength(1)
    const { payload, options } = appels[0]!
    expect(payload.subject).toBe("Commande #ORD_1234 reçue — Eguidar")
    expect(payload.to).toBe(commandeStandard.userEmail)
    expect(options?.idempotencyKey).toBe("commande.creee/ord_1234567890/1")
    expect(payload.html).toContain("Merci pour votre commande")
    expect(payload.html).toContain("https://eguidar.com/commandes")
    expect(payload.text).toContain("Merci pour votre commande")
    expect(payload.html).toContain(site.contactEmail)
    expect(payload.text).toContain(site.contactEmail)
    for (const page of staticPages) {
      expect(payload.html).toContain(`${site.url}${page.href}`)
      expect(payload.text).toContain(`${site.url}${page.href}`)
    }
  })
})

describe("Gabarit", () => {
  it("échappe chaque interpolation, joint les tableaux et ignore les vides", () => {
    const fragment = html`<p>
      ${"<&\"'"} ${["a", html`<b>${"x"}</b>`]}${null}${undefined}${false}
    </p>`

    expect(fragment.html).toContain("&lt;&amp;&quot;&#39;")
    expect(fragment.html).toContain("a<b>x</b>")
    expect(fragment.html).not.toContain("null")
    expect(fragment.html).not.toContain("undefined")
    expect(fragment.html).not.toContain("false")
  })
})
