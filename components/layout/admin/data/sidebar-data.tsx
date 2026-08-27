import type { ComponentProps } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BoxIcon,
  DashboardSpeed02Icon,
  DeliveryTruck01Icon,
  MapsLocation01Icon,
  ShoppingBasket02Icon,
  StoreManagement02Icon,
  TagsIcon,
} from "@hugeicons/core-free-icons"

type HugeiconsGlyph = NonNullable<ComponentProps<typeof HugeiconsIcon>["icon"]>

export interface NavItem {
  title: string
  url: string
  icon?: HugeiconsGlyph
  isExternal?: boolean
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    title: "Catalogue",
    items: [
      { title: "Produits", url: "/admin/produits", icon: BoxIcon },
      { title: "Catégories", url: "/admin/categories", icon: TagsIcon },
    ],
  },
  {
    title: "Ventes",
    items: [
      { title: "Tableau de bord", url: "/admin", icon: DashboardSpeed02Icon },
      { title: "Commandes", url: "/admin/commandes", icon: ShoppingBasket02Icon },
    ],
  },
  {
    title: "Configuration",
    items: [
      { title: "Villes", url: "/admin/villes", icon: MapsLocation01Icon },
      { title: "Livraison", url: "/admin/livraison", icon: DeliveryTruck01Icon },
    ],
  },
]

export const boutiqueSection: NavSection = {
  items: [
    {
      title: "Boutique",
      url: "https://eguidar.com",
      icon: StoreManagement02Icon,
      isExternal: true,
    },
  ],
}