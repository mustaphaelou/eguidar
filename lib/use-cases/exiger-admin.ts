import "server-only"

import { redirect } from "next/navigation"

import { loginUrl } from "@/lib/lien-de-connexion"
import {
  estAdmin,
  lireSession,
  type Client,
} from "@/lib/use-cases/session-courante"

export async function exigerAdmin(): Promise<Client> {
  const client = await lireSession()
  if (!estAdmin(client)) redirect(loginUrl("/admin"))
  return client
}
