import type { Metadata } from "next"
import Link from "next/link"

import { pageMetadata } from "@/lib/metadata"
import { site } from "@/lib/site"

export const metadata: Metadata = pageMetadata({
  title: "Suppression des données",
  description:
    "Comment demander la suppression de votre compte eguidar.com et des données personnelles associées, y compris après une connexion via Google ou Facebook.",
  path: "/suppression-donnees",
})

export default function SuppressionDonneesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Suppression des données</h1>
      <p className="mt-3 text-muted-foreground">
        Cette page explique comment demander la suppression de votre compte et
        des données personnelles associées sur eguidar.com, y compris si vous
        vous êtes inscrit avec Google ou Facebook.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <Section title="1. Comment demander la suppression">
          <p>
            Envoyez un e-mail à{" "}
            <a
              href={`mailto:${site.contactEmail}?subject=Suppression%20de%20compte`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>{" "}
            avec l&apos;objet « Suppression de compte », depuis l&apos;adresse
            e-mail associée à votre compte. Vous pouvez aussi nous écrire via la{" "}
            <Link
              href="/contact"
              className="font-medium text-primary hover:underline"
            >
              page Contact
            </Link>{" "}
            ou nous appeler au{" "}
            <a
              href={`tel:+${site.contactPhoneDigits}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactPhone}
            </a>
            .
          </p>
          <p>
            Si vous ne pouvez plus accéder à l&apos;adresse e-mail de votre
            compte, indiquez-nous un numéro de commande ou un autre élément
            permettant de vérifier que le compte vous appartient.
          </p>
        </Section>

        <Section title="2. Ce que nous supprimons">
          <ul className="list-disc pl-5">
            <li>votre compte et votre profil : nom, adresse e-mail, mot de passe ;</li>
            <li>vos adresses de livraison et votre numéro de téléphone ;</li>
            <li>votre panier et vos préférences enregistrées ;</li>
            <li>
              le lien entre votre compte et Google ou Facebook, ainsi que votre
              photo de profil si elle nous a été transmise.
            </li>
          </ul>
        </Section>

        <Section title="3. Ce que nous conservons">
          <p>
            Les commandes et les documents comptables associés sont conservés
            pendant la durée légale (jusqu&apos;à 10 ans), comme l&apos;exige la
            réglementation. Passé ce délai, ils sont supprimés ou anonymisés.
            Aucune donnée bancaire n&apos;est jamais conservée, le paiement se
            faisant exclusivement à la livraison.
          </p>
        </Section>

        <Section title="4. Délai de traitement">
          <p>
            Nous traitons les demandes dans un délai maximum de 30 jours et vous
            confirmons la suppression par e-mail. Une fois le compte supprimé,
            il ne peut pas être récupéré.
          </p>
        </Section>

        <Section title="5. Connexion via Google ou Facebook">
          <p>
            Supprimer votre compte eguidar ne supprime pas votre compte Google
            ou Facebook. Pour retirer l&apos;accès d&apos;eguidar à ces
            services, utilisez les réglages du fournisseur :
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Google</strong> : compte Google → Sécurité → Vos
              connexions à des applications tierces, sur{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                myaccount.google.com/permissions
              </a>
              ;
            </li>
            <li>
              <strong>Facebook</strong> : Paramètres → Applications et sites
              web, sur{" "}
              <a
                href="https://www.facebook.com/settings?tab=applications"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                facebook.com/settings
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section title="6. Contact">
          <p>
            Pour toute question sur la suppression de vos données, contactez-nous
            par e-mail à{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>{" "}
            ou via la{" "}
            <Link
              href="/contact"
              className="font-medium text-primary hover:underline"
            >
              page Contact
            </Link>
            . Voir aussi notre{" "}
            <Link
              href="/confidentialite"
              className="font-medium text-primary hover:underline"
            >
              politique de confidentialité
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
