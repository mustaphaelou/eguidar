"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const safeImages = images.length > 0 ? images : [null]
  const [index, setIndex] = useState(0)
  const current = Math.min(index, safeImages.length - 1)

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square overflow-hidden rounded-2xl border bg-muted">
        {safeImages[current] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeImages[current]} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Aucune image
          </div>
        )}
      </div>
      {safeImages.length > 1 ? (
        <div className="flex gap-2">
          {safeImages.map((image, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1}`}
              className={cn(
                "size-16 overflow-hidden rounded-xl border transition-colors",
                i === current ? "border-ring" : "border-input opacity-70 hover:opacity-100"
              )}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
