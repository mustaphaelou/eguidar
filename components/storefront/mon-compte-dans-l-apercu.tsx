"use client"

import type { Client } from "@/lib/use-cases/session-courante"

import { ID_MON_COMPTE_DANS_L_APERCU } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { LienQuiFermeLApercu } from "./lien-qui-ferme-l-apercu"
import { SignInButton } from "./sign-in-button"
import { SignOutButton } from "./sign-out-button"

const CLASSE_ENTREE =
  "flex h-9 w-full items-center justify-start rounded-full px-3 text-sm text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"

export function MonCompteDansLApercu({ client }: { client: Client | null }) {
  const { fermer } = useApercuDuPanier()

  return (
    <section
      aria-labelledby={ID_MON_COMPTE_DANS_L_APERCU}
      className="mt-8 border-t pt-6"
    >
      <h2
        id={ID_MON_COMPTE_DANS_L_APERCU}
        className="text-sm font-semibold tracking-[0.007em]"
      >
        Mon compte
      </h2>
      <ul className="mt-3 flex flex-col gap-0.5">
        <li>
          <LienQuiFermeLApercu href="/commandes" className={CLASSE_ENTREE}>
            Commandes
          </LienQuiFermeLApercu>
        </li>
        <li>
          <LienQuiFermeLApercu href="/profil" className={CLASSE_ENTREE}>
            Mon profil
          </LienQuiFermeLApercu>
        </li>
        <li>
          {client === null ? (
            <SignInButton onAvant={fermer} className={CLASSE_ENTREE} />
          ) : (
            <SignOutButton onAvant={fermer} className={CLASSE_ENTREE} />
          )}
        </li>
      </ul>
    </section>
  )
}
