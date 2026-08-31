"use client"

import { useRef } from "react"

import { Button } from "@/components/ui/button"

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
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        if (
          !confirm(`Supprimer « ${cityName} » ? Cette action est définitive.`)
        ) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="cityId" value={cityId} />
      <Button type="submit" variant="destructive" size="sm">
        Supprimer
      </Button>
    </form>
  )
}
