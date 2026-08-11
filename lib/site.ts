const contactPhone = "+212 661 234 567"

export const site = {
  name: "eguidar.ma",
  legalName: "Eguidar",
  tagline: "L'électronique au meilleur prix, livrée partout au Maroc.",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison.",
  contactEmail: "contact@eguidar.ma",
  contactPhone,
  contactPhoneDigits: contactPhone.replace(/\D/g, ""),
  whatsappMessage:
    "Bonjour Eguidar, j'ai une question concernant votre boutique.",
} as const

export const staticPages = [
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
  { href: "/conditions", label: "Conditions & livraison" },
] as const
