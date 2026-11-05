"use client"

import type { CSSProperties } from "react"

import {
  Login03Icon,
  Logout03Icon,
  Package01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { ID_MON_COMPTE_DANS_L_APERCU } from "./apercu-du-panier-identifiants"
import { useApercuDuPanier } from "./apercu-du-panier-provider"
import { LienQuiFermeLApercu } from "./lien-qui-ferme-l-apercu"
import { SignInButton } from "./sign-in-button"
import { SignOutButton } from "./sign-out-button"

const CLASSE_ENTREE =
  "flex h-11 w-fit items-center justify-start gap-3 rounded-lg px-3 text-sm font-semibold tracking-[-0.016em] text-foreground transition-colors duration-150 hover:bg-muted/70 active:bg-muted"

function Icone({ icone }: { icone: IconSvgElement }) {
  return (
    <HugeiconsIcon
      icon={icone}
      strokeWidth={1.8}
      aria-hidden="true"
      className="size-[18px] shrink-0 text-muted-foreground"
    />
  )
}

export function MonCompteDansLApercu({ connecte }: { connecte: boolean }) {
  const { fermer } = useApercuDuPanier()

  return (
    <section
      aria-labelledby={ID_MON_COMPTE_DANS_L_APERCU}
      data-slot="apercu-du-panier-bloc"
      style={{ "--rang-bloc": 1 } as CSSProperties}
      className="mt-12"
    >
      <h2
        id={ID_MON_COMPTE_DANS_L_APERCU}
        className="text-sm font-normal tracking-[-0.016em] text-muted-foreground"
      >
        Mon compte
      </h2>
      <ul className="-mx-3 mt-2 flex flex-col">
        <li>
          <LienQuiFermeLApercu href="/commandes" className={CLASSE_ENTREE}>
            <Icone icone={Package01Icon} />
            Commandes
          </LienQuiFermeLApercu>
        </li>
        <li>
          <LienQuiFermeLApercu href="/profil" className={CLASSE_ENTREE}>
            <Icone icone={UserCircleIcon} />
            Mon profil
          </LienQuiFermeLApercu>
        </li>
        <li>
          {connecte ? (
            <SignOutButton
              icone={<Icone icone={Logout03Icon} />}
              onAvant={fermer}
              className={CLASSE_ENTREE}
            />
          ) : (
            <SignInButton
              icone={<Icone icone={Login03Icon} />}
              onAvant={fermer}
              className={CLASSE_ENTREE}
            />
          )}
        </li>
      </ul>
    </section>
  )
}
