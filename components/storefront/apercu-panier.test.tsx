// @vitest-environment happy-dom
import { act, useMemo } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApercuDuPanier } from "@/lib/panier-transport"
import { creerPortPanierEnMemoire } from "@/test/port-mutations-du-panier"

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
    <div data-testid="image-produit" data-src={src} data-alt={alt} />
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const { openLoginMock } = vi.hoisted(() => ({ openLoginMock: vi.fn() }))

vi.mock("@/components/auth/auth-dialogs", () => ({
  useAuthDialogs: () => ({ openLogin: openLoginMock }),
}))

vi.mock("@/lib/client", () => ({ signOut: vi.fn() }))

import { ID_TITRE_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { ApercuPanier } from "./apercu-panier"
import { ApercuDuPanierProvider } from "./apercu-du-panier-provider"
import { GlobalNavBar } from "./global-nav-bar"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  poserEcran(true)
  openLoginMock.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function poserEcran(large: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) =>
      ({
        matches: requete.includes("min-width: 1024px") ? large : false,
        media: requete,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  )
}

function reponseJson(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200 })
}

function differe<T>(): { promesse: Promise<T>; resoudre: (valeur: T) => void } {
  let resoudre!: (valeur: T) => void
  const promesse = new Promise<T>((resoudreLaPromesse) => {
    resoudre = resoudreLaPromesse
  })
  return { promesse, resoudre }
}

function installerFetch(corps: ApercuDuPanier) {
  const fetchMock = vi.fn(async () => reponseJson(corps))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

async function rendreEtAttendre(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(element))
}

async function rejouer() {
  await act(async () => {})
  await act(async () => {})
}

function BandeauAvecApercu() {
  return (
    <ApercuDuPanierProvider>
      <GlobalNavBar apercuCorps={<ApercuPanier />} />
    </ApercuDuPanierProvider>
  )
}

function BoutonAjout({ port }: { port: PortMutationsDuPanier }) {
  const { ajouter } = useMutationsDuPanier(port)
  return (
    <button type="button" onClick={() => ajouter("variante-a", 1)}>
      Ajouter
    </button>
  )
}

function BandeauEtAjout() {
  const port = useMemo(() => creerPortPanierEnMemoire(), [])
  return (
    <>
      <BoutonAjout port={port} />
      <BandeauAvecApercu />
    </>
  )
}

function declencheurDuPanier() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-label='Panier']"
  )!
}

function dialogue() {
  return container.querySelector<HTMLElement>("[role='dialog']")
}

function appelsApercu(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([adresse]) => adresse === "/api/panier/apercu"
  )
}

async function ouvrirLApercu() {
  act(() => declencheurDuPanier().click())
  await rejouer()
}

/** Clique un lien sans laisser happy-dom tenter une navigation réelle. */
async function cliquerSansNaviguer(lien: HTMLAnchorElement) {
  const empecherLaNavigation = (evenement: Event) => evenement.preventDefault()
  container.addEventListener("click", empecherLaNavigation)
  try {
    act(() => lien.click())
    await rejouer()
  } finally {
    container.removeEventListener("click", empecherLaNavigation)
  }
}

function entree(label: string) {
  return [...container.querySelectorAll<HTMLElement>("a, button")].find(
    (element) => element.textContent?.trim() === label
  )!
}

const VIDE_VISITEUR: ApercuDuPanier = { etat: "vide", connecte: false }
const VIDE_CLIENT: ApercuDuPanier = { etat: "vide", connecte: true }

const PLEIN: ApercuDuPanier = {
  etat: "plein",
  connecte: false,
  lignes: [
    {
      productSlug: "theiere-traditionnelle",
      productName: "Théière traditionnelle",
      variantName: "Standard",
      image: "/images/theiere.jpg",
      quantity: 2,
      unitPrice: 129900,
    },
    {
      productSlug: "theiere-traditionnelle",
      productName: "Théière traditionnelle",
      variantName: "Premium",
      image: null,
      quantity: 1,
      unitPrice: 149900,
    },
  ],
}

describe("ApercuPanier", () => {
  it("ne lit rien avant l'ouverture : l'ouverture est sa première et unique lecture", async () => {
    const fetchMock = installerFetch(VIDE_VISITEUR)

    await rendreEtAttendre(<BandeauAvecApercu />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(dialogue()).toBeNull()

    await ouvrirLApercu()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(appelsApercu(fetchMock)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/panier/apercu",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    )
    expect(dialogue()).not.toBeNull()
    expect(container.textContent).toContain("Votre panier est vide")

    await rejouer()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("montre un squelette tant que le corps n'est pas arrivé", async () => {
    const attente = differe<Response>()
    vi.stubGlobal(
      "fetch",
      vi.fn(() => attente.promesse)
    )

    await rendreEtAttendre(<BandeauAvecApercu />)
    act(() => declencheurDuPanier().click())
    await rejouer()

    expect(
      container.querySelector("[data-slot='apercu-du-panier-squelette']")
    ).not.toBeNull()
    expect(container.textContent).not.toContain("Votre panier est vide")

    await act(async () => {
      attente.resoudre(reponseJson(VIDE_VISITEUR))
    })

    expect(
      container.querySelector("[data-slot='apercu-du-panier-squelette']")
    ).toBeNull()
    expect(container.textContent).toContain("Votre panier est vide")
  })

  it("rend l'état vide d'un Visiteur avec l'invitation à se connecter", async () => {
    installerFetch(VIDE_VISITEUR)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    expect(container.textContent).toContain("Votre panier est vide")
    expect(
      container.querySelector(`#${ID_TITRE_APERCU_DU_PANIER}`)
    ).not.toBeNull()
    expect(container.textContent).toContain(
      "Connectez-vous pour retrouver le panier de votre compte."
    )
    expect(dialogue()!.querySelector("a[href='/']")).toBeNull()
    expect(container.textContent).not.toContain("Découvrir les produits")
    expect(entree("Connexion").tagName).toBe("BUTTON")
    expect(container.textContent).not.toContain("Déconnexion")
  })

  it("rend l'état vide d'un Client sans invitation à se connecter", async () => {
    installerFetch(VIDE_CLIENT)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    expect(container.textContent).toContain("Votre panier est vide")
    expect(container.textContent).not.toContain(
      "Connectez-vous pour retrouver le panier de votre compte."
    )
    expect(dialogue()!.querySelector("a[href='/']")).toBeNull()
    expect(container.textContent).not.toContain("Découvrir les produits")
    expect(entree("Déconnexion").tagName).toBe("BUTTON")
    expect(container.textContent).not.toContain("Connexion</button>")
  })

  it("rend une ligne par Article du panier avec vignette, produit lié et variante", async () => {
    installerFetch(PLEIN)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    expect(container.textContent).toContain("Mon panier")
    expect(container.textContent).not.toContain("Votre panier est vide")
    expect(
      container.querySelectorAll("[data-slot='apercu-du-panier-ligne']")
    ).toHaveLength(2)
    expect(
      container.querySelectorAll("a[href='/produit/theiere-traditionnelle']")
    ).toHaveLength(4)
    expect(container.textContent).toContain("Théière traditionnelle")
    expect(container.textContent).toContain("Standard")
    expect(container.textContent).toContain("Premium")
    const vignette = container.querySelector<HTMLElement>(
      "[data-testid='image-produit']"
    )!
    expect(vignette.getAttribute("data-src")).toBe("/images/theiere.jpg")
    expect(vignette.getAttribute("data-alt")).toBe("Théière traditionnelle")
    expect(container.textContent).toContain("Aucune image")
  })

  it("affiche « N × prix » seulement au-dessus d'une unité", async () => {
    installerFetch(PLEIN)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    expect(container.textContent).toContain("2 × 1.299,00\u00A0MAD")
    expect(container.textContent).not.toContain("1 ×")
    expect(container.textContent?.match(/1\.299,00/g)).toHaveLength(1)
  })

  it("n'offre qu'un seul « Voir le panier », sans stepper, retrait, total, Livraison ou Total à payer", async () => {
    installerFetch(PLEIN)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    expect(container.textContent?.match(/Voir le panier/g)).toHaveLength(1)
    expect(container.querySelector("a[href='/panier']")).not.toBeNull()
    expect(container.textContent).not.toContain("Diminuer la quantité")
    expect(container.textContent).not.toContain("Augmenter la quantité")
    expect(container.textContent).not.toContain("Retirer du panier")
    expect(container.textContent).not.toContain("Sous-total")
    expect(container.textContent).not.toContain("Livraison")
    expect(container.textContent).not.toContain("Total à payer")
    expect(container.textContent).not.toContain("2.598,00")
  })

  it("referme l'Aperçu au clic d'un lien du corps, vers le document attendu", async () => {
    installerFetch(PLEIN)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    const liensProduit = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        "a[href='/produit/theiere-traditionnelle']"
      ),
    ]
    expect(liensProduit).toHaveLength(4)

    await cliquerSansNaviguer(liensProduit[0]!)
    expect(dialogue()).toBeNull()

    await ouvrirLApercu()
    const lienPanier =
      container.querySelector<HTMLAnchorElement>("a[href='/panier']")!
    await cliquerSansNaviguer(lienPanier)
    expect(dialogue()).toBeNull()
  })

  it("rend les Articles dans l'ordre du Panier, de haut en bas", async () => {
    installerFetch(PLEIN)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    const articles = [...container.querySelectorAll<HTMLLIElement>("li")]
      .filter((article) =>
        article.querySelector("a[href='/produit/theiere-traditionnelle']")
      )
      .map((article) => article.textContent ?? "")

    expect(articles).toHaveLength(2)
    expect(articles[0]).toContain("Standard")
    expect(articles[0]).not.toContain("Premium")
    expect(articles[1]).toContain("Premium")
  })

  it("garde les entrées du Compte d'un Client sur un Panier plein", async () => {
    installerFetch({ ...PLEIN, connecte: true })

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    expect(container.textContent).toContain("Mon panier")
    expect(entree("Commandes").getAttribute("href")).toBe("/commandes")
    expect(entree("Mon profil").getAttribute("href")).toBe("/profil")
    expect(entree("Déconnexion").tagName).toBe("BUTTON")
    expect(container.textContent).not.toContain("Connexion</button>")
  })

  it("garde les sémantiques de dialogue, et Escape referme en rendant le focus au panier", async () => {
    installerFetch(VIDE_CLIENT)

    await rendreEtAttendre(<BandeauAvecApercu />)
    await ouvrirLApercu()

    const surface = dialogue()!
    expect(surface.getAttribute("aria-modal")).toBe("true")
    expect(surface.getAttribute("id")).toBe("apercu-du-panier")
    expect(surface.getAttribute("data-slot")).toBe("apercu-du-panier")
    expect(surface.getAttribute("aria-labelledby")).toBe(
      ID_TITRE_APERCU_DU_PANIER
    )
    expect(surface.contains(document.activeElement)).toBe(true)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(dialogue()).toBeNull()
    expect(document.activeElement).toBe(declencheurDuPanier())
  })

  it("relit le corps quand une mutation réussit pendant que l'Aperçu est ouvert", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reponseJson(VIDE_VISITEUR))
      .mockResolvedValueOnce(reponseJson(PLEIN))
    vi.stubGlobal("fetch", fetchMock)

    await rendreEtAttendre(<BandeauEtAjout />)
    await ouvrirLApercu()
    expect(container.textContent).toContain("Votre panier est vide")

    act(() => entree("Ajouter").click())
    await rejouer()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([adresse]) => adresse)).toEqual([
      "/api/panier/apercu",
      "/api/panier/apercu",
    ])
    expect(container.textContent).toContain("Mon panier")
    expect(container.textContent).toContain("Théière traditionnelle")
  })

  it("retrouve le squelette quand la relecture échoue après un corps affiché", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reponseJson(PLEIN))
      .mockRejectedValueOnce(new Error("panne réseau"))
    vi.stubGlobal("fetch", fetchMock)

    await rendreEtAttendre(<BandeauEtAjout />)
    await ouvrirLApercu()
    expect(container.textContent).toContain("Mon panier")

    act(() => entree("Ajouter").click())
    await rejouer()

    // ADR-0038 : une lecture en échec laisse le squelette en place, jamais les
    // Articles de la lecture précédente.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      container.querySelector("[data-slot='apercu-du-panier-squelette']")
    ).not.toBeNull()
    expect(container.textContent).not.toContain("Mon panier")
  })
})
