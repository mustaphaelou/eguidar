import type { Metadata } from "next"
import Link from "next/link"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Conditions & livraison",
  description:
    "Conditions générales de vente et politique de livraison d'eguidar.com : paiement à la livraison, frais de livraison par ville, délais, retours et remboursements.",
}

export default function ConditionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Conditions &amp; livraison</h1>
      <p className="mt-3 text-muted-foreground">
        Les conditions générales de vente de la boutique eguidar.com, applicables
        à toute commande passée sur le site.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <Section title="1. Commande">
          <p>
            Toute commande est confirmée après validation par nos soins. Un
            e-mail de confirmation récapitulant les articles, le montant total
            et l&apos;adresse de livraison vous est envoyé dès la prise de
            commande. Nous nous réservons le droit d&apos;annuler une commande
            en cas de produit indisponible ou de litige sur le paiement à la
            livraison.
          </p>
        </Section>

        <Section title="2. Prix et TVA">
          <p>
            Tous les prix sont affichés en dirhams marocains (MAD) et incluent
            la TVA de 20%. Les frais de livraison ne sont pas inclus dans le
            prix des produits : ils sont calculés en fonction de la ville de
            livraison et affichés avant la confirmation de la commande. Les prix
            et offres sont susceptibles d&apos;évoluer à tout moment ; la
            commande est facturée au prix affiché au moment de sa validation.
          </p>
        </Section>

        <Section title="3. Paiement à la livraison">
          <p>
            La boutique propose exclusivement le paiement à la livraison (COD) :
            le montant total de la commande — produits, TVA incluse, et frais de
            livraison — est réglé en espèces au livreur au moment de la remise
            du colis. Préparez le montant exact si possible. Aucune autre
            méthode de paiement n&apos;est acceptée pour le moment.
          </p>
        </Section>

        <Section title="4. Livraison">
          <p>
            Nous livrons dans les principales villes du Maroc. Les frais de
            livraison sont fixes par ville et affichés lors du choix de votre
            ville dans le panier. La livraison est offerte dans les cas suivants
            :
          </p>
          <ul className="list-disc pl-5">
            <li>
              lorsque le montant de la commande atteint le seuil de livraison
              offerte ;
            </li>
            <li>pour les produits marqués « livraison offerte ».</li>
          </ul>
          <p>
            Les délais de livraison sont généralement de 2 à 5 jours ouvrés
            selon la ville. Le livreur vous appelle au numéro indiqué dans la
            commande ; veillez à ce qu&apos;il soit correct. En cas de
            non-réponse ou d&apos;adresse inaccessible, le colis peut être
            retourné et la commande annulée.
          </p>
        </Section>

        <Section title="5. Vérification à la réception">
          <p>
            À la réception, vérifiez l&apos;état de l&apos;emballage avant de
            régler le livreur. En cas de colis abîmé, notez-le sur le bon de
            livraison et contactez-nous le jour même avec une photo : nous
            traiterons votre réclamation rapidement. Les produits sont réputés
            acceptés dès la réception du colis sans réserve.
          </p>
        </Section>

        <Section title="6. Retours et remboursements">
          <p>
            Conformément à la législation marocaine sur le commerce
            électronique, vous disposez d&apos;un droit de rétractation de 7
            jours à compter de la réception de votre commande. Pour être
            accepté, le produit doit être retourné :
          </p>
          <ul className="list-disc pl-5">
            <li>
              dans son emballage d&apos;origine, sans marque d&apos;utilisation
              ;
            </li>
            <li>avec tous ses accessoires et documents ;</li>
            <li>le plus rapidement possible, idéalement sous 7 jours.</li>
          </ul>
          <p>
            Pour initier un retour, contactez notre service client par
            téléphone, WhatsApp ou e-mail en indiquant votre numéro de commande.
            Le remboursement est effectué sous 7 jours après réception et
            contrôle du produit retourné. Certains produits (articles ouverts,
            endommagés, ou sans emballage d&apos;origine) ne peuvent pas être
            repris.
          </p>
        </Section>

        <Section title="7. Annulation">
          <p>
            Vous pouvez annuler votre commande à tout moment tant qu&apos;elle
            n&apos;a pas été expédiée, en nous contactant directement. Après
            expédition, vous pouvez refuser le colis à la livraison : la
            commande sera alors annulée et aucun montant ne vous sera réclamé.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            Pour toute question relative à ces conditions, contactez-nous par
            e-mail à{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>
            , par téléphone ou WhatsApp au{" "}
            <a
              href={`tel:+${site.contactPhoneDigits}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactPhone}
            </a>{" "}
            ou via la{" "}
            <Link
              href="/contact"
              className="font-medium text-primary hover:underline"
            >
              page Contact
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
