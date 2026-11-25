"use client"

import Image from "next/image"
import { useState, type KeyboardEvent } from "react"

import type { ImageProduitGalerie } from "@/lib/images-produit/galerie"
import { cn } from "@/lib/utils"

function libelleImage(
  position: number,
  total: number,
  alt: string | null
): string {
  const description = alt ? ` — ${alt}` : ""
  return `Afficher l'image ${position} sur ${total}${description}`
}

export function ProductGallery({
  images,
  name,
}: {
  images: ImageProduitGalerie[]
  name: string
}) {
  const safeImages: (ImageProduitGalerie | null)[] =
    images.length > 0 ? images : [null]
  const [index, setIndex] = useState(0)
  const current = Math.min(index, safeImages.length - 1)
  const image = safeImages[current]
  const total = safeImages.length

  function preceder() {
    setIndex((courant) => (courant - 1 + total) % total)
  }

  function avancer() {
    setIndex((courant) => (courant + 1) % total)
  }

  function surTouche(event: KeyboardEvent<HTMLDivElement>) {
    if (total <= 1) return
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      preceder()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      avancer()
    }
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={surTouche}>
      <div className="relative aspect-square overflow-clip rounded-2xl bg-muted ring-1 ring-hairline ring-inset">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? name}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            preload={current === 0}
            className="object-contain p-4 sm:p-6"
          />
        ) : (
          <div className="flex items-center justify-center text-sm text-muted-foreground block-full">
            Aucune image
          </div>
        )}
        {image && total > 1 ? (
          <>
            <button
              type="button"
              onClick={preceder}
              aria-label="Image précédente"
              className="voile-depoli zone-tactile absolute inset-s-3 inset-bs-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-foreground ring-1 ring-hairline transition-[opacity,box-shadow] duration-150 ease-out [--voile-depoli-opacite:84%] ring-inset active:opacity-80 motion-safe:transition-[opacity,box-shadow,transform] motion-safe:active:scale-95 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-bordure-subtile"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0 block-[1.1cap] inline-auto"
              >
                <path
                  d="M10 3.5 5.5 8l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={avancer}
              aria-label="Image suivante"
              className="voile-depoli zone-tactile absolute inset-e-3 inset-bs-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-foreground ring-1 ring-hairline transition-[opacity,box-shadow] duration-150 ease-out [--voile-depoli-opacite:84%] ring-inset active:opacity-80 motion-safe:transition-[opacity,box-shadow,transform] motion-safe:active:scale-95 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-bordure-subtile"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0 block-[1.1cap] inline-auto"
              >
                <path
                  d="M6 3.5 10.5 8 6 12.5"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <p
              aria-hidden="true"
              className="voile-depoli absolute inset-e-3 inset-be-3 rounded-full px-2.5 py-1 text-[12px] leading-[1.3334] font-medium tracking-[-0.01em] text-foreground tabular-nums ring-1 ring-hairline [--voile-depoli-opacite:84%] ring-inset"
            >
              {current + 1} / {total}
            </p>
          </>
        ) : null}
      </div>
      {total > 1 ? (
        <div
          role="group"
          aria-label="Images du produit"
          className="rail-defilant flex snap-x snap-proximity gap-2.5 px-0.5 py-1"
        >
          {safeImages.map((candidate, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={libelleImage(i + 1, total, candidate?.alt ?? null)}
              aria-pressed={i === current}
              className={cn(
                "relative size-16 shrink-0 snap-start overflow-clip rounded-xl bg-muted transition-[opacity,box-shadow] duration-150 ease-out ring-inset motion-safe:transition-[opacity,box-shadow,transform] motion-safe:active:scale-[0.96]",
                i === current
                  ? "opacity-100 ring-2 ring-foreground"
                  : "opacity-65 ring-1 ring-hairline active:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-100"
              )}
            >
              {candidate ? (
                <Image
                  src={candidate.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 72px, 16vw"
                  className="object-contain p-1.5"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
