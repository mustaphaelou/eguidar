"use client"

import Image from "next/image"
import { useState } from "react"

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

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-clip rounded-2xl bg-muted">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? name}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            preload={current === 0}
            className="object-contain p-2 sm:p-3"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Aucune image
          </div>
        )}
        {image && total > 1 ? (
          <p
            aria-hidden="true"
            className="absolute inset-e-3 inset-be-3 rounded-full bg-background/85 px-2.5 py-1 text-[12px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground tabular-nums backdrop-blur"
          >
            {current + 1} / {total}
          </p>
        ) : null}
      </div>
      {total > 1 ? (
        <div
          role="group"
          aria-label="Images du produit"
          className="grid grid-cols-6 gap-2"
        >
          {safeImages.map((candidate, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={libelleImage(i + 1, total, candidate?.alt ?? null)}
              aria-pressed={i === current}
              className={cn(
                "relative aspect-square overflow-clip rounded-xl bg-muted transition-opacity",
                i === current
                  ? "opacity-100 ring-2 ring-foreground"
                  : "opacity-60 hover:opacity-100"
              )}
            >
              {candidate ? (
                <Image
                  src={candidate.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 72px, 16vw"
                  className="object-contain p-1"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
