"use client"

import { useRef } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Delete01Icon } from "@hugeicons/core-free-icons"

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
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Supprimer ${cityName}`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} aria-hidden="true" />
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
