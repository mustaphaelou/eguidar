"use client"

import Image from "next/image"
import { useState } from "react"

import type { ImageProduitGalerie } from "@/lib/galerie-image-produit"
import { cn } from "@/lib/utils"

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

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? name}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            preload={current === 0}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Aucune image
          </div>
        )}
      </div>
      {safeImages.length > 1 ? (
        <div className="flex gap-2">
          {safeImages.map((candidate, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1}`}
              aria-pressed={i === current}
              className={cn(
                "relative size-16 overflow-hidden rounded-xl transition-opacity",
                i === current
                  ? "opacity-100 ring-1 ring-foreground/40"
                  : "opacity-50 hover:opacity-100"
              )}
            >
              {candidate ? (
                <Image
                  src={candidate.url}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
