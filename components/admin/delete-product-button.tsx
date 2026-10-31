"use client"

import { useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
  const annulerRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Supprimer
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={annulerRef}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">
            Supprimer « {productName} »
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive : le Produit et ses Variantes seront
            supprimés du Catalogue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input
            type="hidden"
            name={CHAMPS_FORMULAIRE_PRODUIT.produit}
            value={productId}
          />
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button ref={annulerRef} variant="outline" />}
            >
              Annuler
            </AlertDialogClose>
            <Button type="submit" variant="destructive">
              Supprimer définitivement
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
