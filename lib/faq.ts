import { site } from "@/lib/site"

export interface FaqEntry {
  question: string
  answer: string
}

export const faqs: readonly FaqEntry[] = [
  {
    question: "Comment passer commande ?",
    answer:
      "Parcourez le catalogue, ajoutez vos produits au panier puis choisissez votre ville de livraison. À l'étape de commande, vérifiez votre adresse et votre numéro de téléphone, puis confirmez. Vous recevrez une confirmation par e-mail avec le détail de votre commande.",
  },
  {
    question: "Quels sont les moyens de paiement ?",
    answer:
      "Le paiement à la livraison est le seul moyen de paiement : vous réglez le montant total en espèces directement au livreur à la réception de votre colis. Aucun paiement en ligne n'est demandé.",
  },
  {
    question: "Les prix affichés incluent-ils la TVA ?",
    answer:
      "Oui. Tous les prix sont affichés en dirhams (MAD), TVA 20% incluse. Les frais de livraison sont ajoutés au moment du choix de votre ville et apparaissent avant la confirmation de la commande.",
  },
  {
    question: "Combien coûte la livraison ?",
    answer:
      "Les frais de livraison dépendent de votre ville. La livraison est offerte dès un certain montant d'achat (affiché dans votre panier) ainsi que pour les produits marqués « livraison offerte ». Le montant exact est toujours indiqué avant de confirmer votre commande.",
  },
  {
    question: "Quel est le délai de livraison ?",
    answer:
      "Nous livrons dans les principales villes du Maroc, généralement sous 2 à 5 jours ouvrés selon votre ville. Vous recevez un e-mail à chaque changement de statut : confirmation, expédition, livraison.",
  },
  {
    question: "Comment suivre ma commande ?",
    answer:
      "Connectez-vous à votre espace client : la page « Mes commandes » affiche le statut de chaque commande (en attente, confirmée, expédiée, livrée). Vous recevez également un e-mail à chaque changement de statut.",
  },
  {
    question: "Puis-je annuler ma commande ?",
    answer:
      "Oui, contactez-nous par téléphone, WhatsApp ou e-mail tant que la commande n'est pas expédiée. Après expédition, vous pouvez refuser le colis à la livraison ou demander un retour.",
  },
  {
    question: "Comment retourner un produit ?",
    answer:
      "Vous disposez de 7 jours après la réception pour retourner un produit dans son emballage d'origine, non ouvert et inutilisé. Contactez notre service client pour organiser le retour ; le remboursement est effectué sous 7 jours après réception. Consultez nos conditions pour le détail.",
  },
  {
    question: "Que faire si mon colis arrive abîmé ?",
    answer:
      "Inspectez votre colis à la réception. En cas de problème, signalez-le immédiatement au livreur et contactez-nous le jour même avec une photo de l'état du colis : nous trouverons une solution rapidement.",
  },
  {
    question: "Comment vous contacter ?",
    answer: `Par WhatsApp ou téléphone au ${site.contactPhone}, ou par e-mail à ${site.contactEmail}. Vous trouverez tous les détails sur la page Contact.`,
  },
]
