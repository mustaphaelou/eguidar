import { describe, expect, it } from "vitest"

import { formatPrice } from "@/lib/money"
import { site, staticPages } from "@/lib/site"

import type { ClientEmails } from "./adaptateur-envoi"
import {
  commandeCaracteresSpeciaux,
  commandeLivraisonOfferte,
  commandeStandard,
} from "./exemples"
import { etapeDe } from "./etapes"
import { html, rendreLettre } from "./gabarit"
import {
  sendDigestEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
} from "./index"

interface AppelEmail {
  payload: {
    from: string
    to: string
    subject: string
    html: string
    text?: string
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

const MONTANTS = [
  formatPrice(commandeStandard.total),
  formatPrice(commandeStandard.shippingFee),
  formatPrice(commandeStandard.totalPayable),
]

const PHRASE_PAIEMENT =
  "Réglez en espèces au livreur lors de la réception de votre colis."

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
    expect(payload.html).toContain(PHRASE_PAIEMENT)
    expect(payload.text).toContain(PHRASE_PAIEMENT)
    expect(payload.html).toContain(site.contactEmail)
    expect(payload.text).toContain(site.contactEmail)
    for (const page of staticPages) {
      expect(payload.html).toContain(`${site.url}${page.href}`)
      expect(payload.text).toContain(`${site.url}${page.href}`)
    }
  })

  it("dit les mêmes montants dans le HTML et dans le texte", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(commandeStandard, undefined, client)

    const { payload } = appels[0]!
    for (const montant of MONTANTS) {
      expect(payload.html).toContain(montant)
      expect(payload.text).toContain(montant)
    }
    expect(payload.html).toContain("Total à payer à la livraison")
    expect(payload.text).toContain("Total à payer à la livraison")
  })

  it("dit « Livraison offerte » quand les frais sont nuls", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(commandeLivraisonOfferte, undefined, client)

    const { payload } = appels[0]!
    expect(payload.html).toContain("Livraison offerte")
    expect(payload.text).toContain("Livraison offerte")
    expect(payload.html).not.toMatch(/(^|[^\d])0,00\s*MAD/)
    expect(payload.text).not.toMatch(/(^|[^\d])0,00\s*MAD/)
  })

  it("échappe un nom de produit hostile, et le laisse brut dans le texte", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(commandeCaracteresSpeciaux, undefined, client)

    const { payload } = appels[0]!
    expect(payload.html).toContain("Théière &lt;&amp;&quot;&#39;")
    expect(payload.html).toContain("Édition &amp; dorée")
    expect(payload.html).not.toContain('<&"')
    expect(payload.text).toContain("Théière <&\"'")
    expect(payload.text).toContain("Édition & dorée")
  })

  it("n'écrit pas de ligne « Téléphone » quand le téléphone est vide", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(
      { ...commandeStandard, phone: "" },
      undefined,
      client
    )

    const { payload } = appels[0]!
    expect(payload.html).not.toContain("Téléphone")
    expect(payload.text).not.toContain("Téléphone")
    expect(payload.html).toContain("Livraison")
    expect(payload.text).toContain("Livraison")
  })

  it("ne laisse pas de « · » orphelin quand la variante est vide", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(
      {
        ...commandeStandard,
        items: [{ ...commandeStandard.items[0]!, variantName: "" }],
      },
      undefined,
      client
    )

    const { payload } = appels[0]!
    expect(payload.html).toContain("Théière")
    expect(payload.text).toContain("Théière")
    expect(payload.html).not.toMatch(/Théière\s*·/)
    expect(payload.text).not.toMatch(/Théière\s*·/)
  })

  it("ne rend que le récapitulatif quand la Commande n'a aucun article", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderPlacedEmail(
      { ...commandeStandard, items: [] },
      undefined,
      client
    )

    const { payload } = appels[0]!
    for (const corps of [payload.html, payload.text]) {
      expect(corps).toContain("Sous-total (TVA incluse)")
      expect(corps).toContain("Total à payer à la livraison")
      expect(corps).not.toContain("quantité")
    }
  })
})

describe("Lettre de changement de statut", () => {
  it("garde le sujet, la Clé d'idempotence et le récapitulatif", async () => {
    const { client, appels } = clientEnMemoire()

    await sendOrderStatusEmail(commandeStandard, "confirmed", undefined, client)

    expect(appels).toHaveLength(1)
    const { payload, options } = appels[0]!
    expect(payload.subject).toBe(
      "Votre commande #ORD_1234 : Confirmée — Eguidar"
    )
    expect(payload.to).toBe(commandeStandard.userEmail)
    expect(options?.idempotencyKey).toBe(
      "commande.statut/ord_1234567890/confirmed"
    )
    for (const corps of [payload.html, payload.text]) {
      expect(corps).toContain(
        "Votre commande est confirmée : nous la préparons."
      )
      expect(corps).toContain("Total à payer à la livraison")
      for (const montant of MONTANTS) expect(corps).toContain(montant)
    }
    expect(payload.html).toContain("https://eguidar.com/commandes")
    expect(payload.text).toContain("https://eguidar.com/commandes")
  })
})

const ÉTAPES_ATTENDUES = ["Reçue", "Confirmée", "Expédiée", "Livrée"]

const PROGRESSIONS = [
  {
    statut: "pending",
    introduction: "Nous avons bien reçu votre commande.",
    étape: "Reçue",
  },
  {
    statut: "confirmed",
    introduction: "Votre commande est confirmée : nous la préparons.",
    étape: "Confirmée",
  },
  {
    statut: "shipped",
    introduction: "Votre commande est expédiée : elle arrive bientôt.",
    étape: "Expédiée",
  },
  {
    statut: "delivered",
    introduction: "Votre commande est livrée. Merci de votre confiance.",
    étape: "Livrée",
  },
] as const

describe("Lettre de changement de statut — progression", () => {
  it.each(PROGRESSIONS)(
    "annonce « $introduction » et marque « $étape » pour $statut",
    async ({ statut, introduction, étape }) => {
      const { client, appels } = clientEnMemoire()

      await sendOrderStatusEmail(commandeStandard, statut, undefined, client)

      const { payload } = appels[0]!
      for (const corps of [payload.html, payload.text]) {
        expect(corps).toContain(introduction)
      }
      expect(payload.html.match(/aria-current="step"/g)).toHaveLength(1)
      expect(payload.html).toMatch(
        new RegExp(`aria-current="step"[^>]*>\\s*${étape}`)
      )
      for (const libellé of ÉTAPES_ATTENDUES) {
        expect(payload.html).toContain(libellé)
      }
      for (const libellé of ÉTAPES_ATTENDUES.filter(
        (libellé) => libellé !== étape
      )) {
        expect(payload.html).not.toMatch(
          new RegExp(`aria-current="step"[^>]*>\\s*${libellé}`)
        )
      }
      expect(payload.html).toContain("https://eguidar.com/commandes")
      expect(payload.text).toContain("https://eguidar.com/commandes")
      expect(payload.html).toContain("Total à payer à la livraison")
      expect(payload.text).toContain("Total à payer à la livraison")
    }
  )
})

const ARRÊTS = [
  {
    statut: "cancelled",
    titre: "Votre commande a été annulée.",
    bandeau: "Annulée",
    phrase: "Vous n'avez rien à payer.",
    phraseHtml: "Vous n&#39;avez rien à payer.",
  },
  {
    statut: "returned",
    titre: "Votre commande a été retournée.",
    bandeau: "Retournée",
    phrase:
      "Si vous avez réglé la livraison, écrivez-nous pour demander un remboursement.",
    phraseHtml:
      "Si vous avez réglé la livraison, écrivez-nous pour demander un remboursement.",
  },
] as const

describe("Lettre de changement de statut — commande arrêtée", () => {
  it.each(ARRÊTS)(
    "remplace la progression par un bandeau pour $statut",
    async ({ statut, titre, bandeau, phrase, phraseHtml }) => {
      const { client, appels } = clientEnMemoire()

      await sendOrderStatusEmail(commandeStandard, statut, undefined, client)

      const { payload } = appels[0]!
      for (const corps of [payload.html, payload.text]) {
        expect(corps).toContain(titre)
        expect(corps).toContain(bandeau)
      }
      expect(payload.html).toContain(phraseHtml)
      expect(payload.text).toContain(phrase)
      expect(payload.html).not.toContain("aria-current")
      for (const libellé of ÉTAPES_ATTENDUES) {
        expect(payload.html).not.toContain(libellé)
      }
      expect(payload.html).toContain("Total à payer à la livraison")
      expect(payload.text).toContain("Total à payer à la livraison")
      for (const montant of MONTANTS) {
        expect(payload.html).toContain(montant)
        expect(payload.text).toContain(montant)
      }
      expect(payload.html).toContain("https://eguidar.com/commandes")
      expect(payload.text).toContain("https://eguidar.com/commandes")
      expect(payload.html).toContain(site.contactEmail)
      expect(payload.text).toContain(site.contactEmail)
    }
  )
})

describe("Lettre de changement de statut — instruction de paiement", () => {
  it.each([
    ["pending", true],
    ["confirmed", true],
    ["shipped", true],
    ["delivered", false],
    ["cancelled", false],
    ["returned", false],
  ] as const)(
    "dit la phrase de paiement pour %s : %s",
    async (statut, annoncée) => {
      const { client, appels } = clientEnMemoire()

      await sendOrderStatusEmail(commandeStandard, statut, undefined, client)

      const { payload } = appels[0]!
      for (const corps of [payload.html, payload.text]) {
        if (annoncée) {
          expect(corps).toContain(PHRASE_PAIEMENT)
        } else {
          expect(corps).not.toContain(PHRASE_PAIEMENT)
        }
      }
    }
  )
})

const ENVELOPPES = [
  {
    statut: "pending",
    libellé: "En attente",
    introduction: "Nous avons bien reçu votre commande.",
  },
  {
    statut: "confirmed",
    libellé: "Confirmée",
    introduction: "Votre commande est confirmée : nous la préparons.",
  },
  {
    statut: "shipped",
    libellé: "Expédiée",
    introduction: "Votre commande est expédiée : elle arrive bientôt.",
  },
  {
    statut: "delivered",
    libellé: "Livrée",
    introduction: "Votre commande est livrée. Merci de votre confiance.",
  },
  {
    statut: "cancelled",
    libellé: "Annulée",
    introduction: "Votre commande a été annulée.",
  },
  {
    statut: "returned",
    libellé: "Retournée",
    introduction: "Votre commande a été retournée.",
  },
] as const

describe("Lettre de changement de statut — enveloppe", () => {
  it.each(ENVELOPPES)(
    "garde l'enveloppe et la forme du texte pour $statut",
    async ({ statut, libellé, introduction }) => {
      const { client, appels } = clientEnMemoire()

      await sendOrderStatusEmail(commandeStandard, statut, undefined, client)

      expect(appels).toHaveLength(1)
      const { payload, options } = appels[0]!
      expect(payload.to).toBe(commandeStandard.userEmail)
      expect(payload.subject).toBe(
        `Votre commande #ORD_1234 : ${libellé} — Eguidar`
      )
      expect(options?.idempotencyKey).toBe(
        `commande.statut/ord_1234567890/${statut}`
      )
      expect(payload.html).toContain("Suivre ma commande")
      expect(payload.html).toContain("https://eguidar.com/commandes")

      const texte = payload.text ?? ""
      const repères = [
        "Eguidar",
        "Commande #ORD_1234",
        introduction,
        "Total à payer à la livraison",
        "Suivre ma commande : https://eguidar.com/commandes",
        `Écrivez-nous : ${site.contactEmail}`,
      ]
      const positions = repères.map((repère) => texte.indexOf(repère))
      for (const position of positions) {
        expect(position).toBeGreaterThanOrEqual(0)
      }
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  )
})

describe("Le gabarit", () => {
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

  it("rend un document complet, pré-en-tête et note d'en-tête compris", () => {
    const document = rendreLettre({
      préEnTête: "Phrase d'aperçu unique",
      noteEnTête: "Commande #EXEMPLE",
      blocs: [{ type: "titre", texte: "Un titre de lettre" }],
    })

    expect(document).toContain("<!DOCTYPE html>")
    expect(document).toContain('lang="fr"')
    expect(document).toContain('name="viewport"')
    expect(document).toContain("<title>Un titre de lettre</title>")
    expect(document).toContain("Phrase d&#39;aperçu unique")
    expect(document).toContain("Commande #EXEMPLE")
    expect(document).toContain("Eguidar")
    expect(document.match(/@media/g)).toHaveLength(1)
    expect(document).not.toContain("<!--[if")
    expect(document).not.toContain("<img")
  })

  it("marque l'étape atteinte par aria-current, et elle seule", () => {
    const document = rendreLettre({
      préEnTête: "Position de la commande",
      blocs: [{ type: "etapes", statut: "confirmed" }],
    })

    expect(document.match(/aria-current="step"/g)).toHaveLength(1)
    expect(document).toMatch(/aria-current="step"[^>]*>\s*Confirmée/)
    for (const libellé of ["Reçue", "Confirmée", "Expédiée", "Livrée"]) {
      expect(document).toContain(libellé)
    }
  })

  it("ne rend aucune étape pour une Commande arrêtée", () => {
    const document = rendreLettre({
      préEnTête: "Commande arrêtée",
      blocs: [{ type: "etapes", statut: "cancelled" }],
    })

    expect(document).not.toContain("aria-current")
    expect(document).not.toContain("Confirmée")
  })

  it("tient la table Statut vers étape", () => {
    expect(
      (["pending", "confirmed", "shipped", "delivered"] as const).map(etapeDe)
    ).toEqual([1, 2, 3, 4])
    expect(etapeDe("cancelled")).toBe("arrêté")
    expect(etapeDe("returned")).toBe("arrêté")
  })
})

describe("Digest", () => {
  it("conserve son sujet, son destinataire, sa clé et son HTML <pre>", async () => {
    const { client, appels } = clientEnMemoire()

    await sendDigestEmail(
      {
        destinataire: "proprietaire@example.com",
        sujet: "Digest du 2026-11-07",
        texte: "Stock bas : 3 Produits",
        cleIdempotence: "digest/2026-11-07",
      },
      client
    )

    expect(appels).toHaveLength(1)
    const { payload, options } = appels[0]!
    expect(payload.subject).toBe("Digest du 2026-11-07")
    expect(payload.to).toBe("proprietaire@example.com")
    expect(options).toEqual({ idempotencyKey: "digest/2026-11-07" })
    expect(payload.html).toMatch(/^<pre[^>]*>/)
    expect(payload.html).toContain("</pre>")
    expect(payload.html).toContain("Stock bas : 3 Produits")
    expect(payload).not.toHaveProperty("text")
  })
})
