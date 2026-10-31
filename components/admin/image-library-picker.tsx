"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  EntreeBibliothequeImageProduit,
  ImageProduitGalerie,
} from "@/lib/galerie-image-produit"

interface ImageLibraryPickerProps {
  bibliotheque: readonly EntreeBibliothequeImageProduit[]
  dejaPresentes: ReadonlySet<string>
  desactivee?: boolean
  onChoisir(image: ImageProduitGalerie): void
}

function correspond(
  image: EntreeBibliothequeImageProduit,
  recherche: string
): boolean {
  if (!recherche) return true
  return (
    image.publicUrl.toLocaleLowerCase("fr").includes(recherche) ||
    (image.alt?.toLocaleLowerCase("fr").includes(recherche) ?? false)
  )
}

export function ImageLibraryPicker({
  bibliotheque,
  dejaPresentes,
  desactivee = false,
  onChoisir,
}: ImageLibraryPickerProps) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState("")

  const disponibles = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr")
    return bibliotheque.filter(
      (image) => !dejaPresentes.has(image.publicUrl) && correspond(image, terme)
    )
  }, [bibliotheque, dejaPresentes, recherche])

  function choisir(image: EntreeBibliothequeImageProduit) {
    onChoisir({ url: image.publicUrl, alt: image.alt })
    setRecherche("")
    setOuvert(false)
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
        disabled={desactivee}
      >
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Choisir dans la bibliothèque
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bibliothèque des médias</DialogTitle>
          <DialogDescription>
            Choisissez une Image produit déjà enregistrée : elle rejoint la
            Galerie produit sans nouvel envoi.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="picker-medias-q">Rechercher une Image produit</Label>
          <Input
            id="picker-medias-q"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Texte alternatif ou adresse…"
          />
        </div>
        {disponibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune Image produit disponible dans la bibliothèque.
          </p>
        ) : (
          <ul className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {disponibles.map((image) => (
              <li key={image.publicUrl}>
                <button
                  type="button"
                  onClick={() => choisir(image)}
                  className="flex w-full flex-col gap-1 rounded-xl border p-2 text-start hover:bg-muted"
                  aria-label={`Choisir l'Image produit ${
                    image.alt ?? image.publicUrl
                  }`}
                >
                  <Image
                    src={image.publicUrl}
                    alt=""
                    width={96}
                    height={96}
                    sizes="96px"
                    className="size-24 self-center rounded-lg object-cover"
                  />
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {image.alt ?? "Sans texte alternatif"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
