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

interface DeleteCityButtonProps {
  cityId: string
  cityName: string
  action: (formData: FormData) => Promise<void>
}

export function DeleteCityButton({
  cityId,
  cityName,
  action,
}: DeleteCityButtonProps) {
  const annulerRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Supprimer
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={annulerRef}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">
            Supprimer « {cityName} »
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="cityId" value={cityId} />
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
