import { readFile } from "node:fs/promises"
import path from "node:path"

import tailwind from "@tailwindcss/postcss"
import postcss, { type Root } from "postcss"

export type FeuilleDeStyleCompilee = {
  css: string
  racine: Root
}

let compilation: Promise<FeuilleDeStyleCompilee> | undefined

export function compilerLaFeuilleDeStyle(): Promise<FeuilleDeStyleCompilee> {
  compilation ??= compiler()

  return compilation
}

async function compiler(): Promise<FeuilleDeStyleCompilee> {
  const chemin = path.resolve(process.cwd(), "app/globals.css")
  const source = await readFile(chemin, "utf8")
  const resultat = await postcss([tailwind()]).process(source, { from: chemin })

  return { css: resultat.css, racine: resultat.root }
}
