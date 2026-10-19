"use client"

import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { CHAMPS_FORMULAIRE_PRODUIT } from "@/lib/formulaire-produit"

interface DeleteProductButtonProps {
  productId: string
  productName: string
  action: (formData: FormData) => Promise<void>
}

export function DeleteProductButton({
  productId,
  productName,
  action,
}: DeleteProductButtonProps) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        if (
          !confirm(
            `Supprimer « ${productName} » ? Cette action est définitive.`
          )
        ) {
          event.preventDefault()
        }
      }}
    >
      <input
        type="hidden"
        name={CHAMPS_FORMULAIRE_PRODUIT.produit}
        value={productId}
      />
      <Button type="submit" variant="destructive" size="sm">
        Supprimer
      </Button>
    </form>
  )
}
