"use client"

import { useEffect, useRef, useState } from "react"

import { site } from "@/lib/site"

const ID_OPTIONS = "partage-article-options"
const DELAI_CONFIRMATION_MS = 4000

export function PartageArticle({
  titre,
  slug,
}: {
  titre: string
  slug: string
}) {
  const url = `${site.url}/blog/${slug}`
  const natifRef = useRef(false)
  const [ouvert, setOuvert] = useState(false)
  const [annonce, setAnnonce] = useState("")

  useEffect(() => {
    natifRef.current =
      typeof navigator !== "undefined" && typeof navigator.share === "function"
  }, [])

  useEffect(() => {
    if (!annonce) return
    const minuterie = window.setTimeout(
      () => setAnnonce(""),
      DELAI_CONFIRMATION_MS
    )
    return () => window.clearTimeout(minuterie)
  }, [annonce])

  function activer() {
    if (natifRef.current) {
      void navigator.share({ title: titre, url }).catch(() => {})
      return
    }
    setOuvert((etat) => !etat)
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(url)
      setAnnonce("Lien copié dans le presse-papiers.")
    } catch {
      setAnnonce("La copie du lien a échoué.")
    }
  }

  return (
    <div className="mt-[20px]">
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={ID_OPTIONS}
        onClick={activer}
        className="inline-flex items-center gap-2 text-[14px] leading-[1.2858] font-semibold tracking-[-0.016em] text-muted-foreground hover:text-foreground"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 15V3" />
          <path d="m7 8 5-5 5 5" />
          <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
        </svg>
        Partager
      </button>

      <div id={ID_OPTIONS} hidden={!ouvert} className="mt-[12px]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${titre} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Partager sur WhatsApp (ouvre une nouvelle fenêtre)"
            className="text-[14px] leading-[1.2858] font-semibold tracking-[-0.016em] text-link hover:underline"
          >
            WhatsApp
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Partager sur Facebook (ouvre une nouvelle fenêtre)"
            className="text-[14px] leading-[1.2858] font-semibold tracking-[-0.016em] text-link hover:underline"
          >
            Facebook
          </a>
          <button
            type="button"
            onClick={() => void copier()}
            className="text-[14px] leading-[1.2858] font-semibold tracking-[-0.016em] text-link hover:underline"
          >
            Copier le lien
          </button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="mt-[8px] text-[12px] leading-[1.3334] font-semibold tracking-[-0.01em] text-muted-foreground"
        >
          {annonce}
        </p>
      </div>
    </div>
  )
}
