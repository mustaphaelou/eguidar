"use client"

import Link from "next/link"
import type { ComponentProps } from "react"

import { useApercuDuPanier } from "./apercu-du-panier-provider"

export function LienQuiFermeLApercu({
  onClick,
  ...props
}: ComponentProps<typeof Link>) {
  const { fermer } = useApercuDuPanier()

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event)
        fermer()
      }}
    />
  )
}
