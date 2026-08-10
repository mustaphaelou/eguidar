"use server"

import {
  addToCart,
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/use-cases/cart"
import { requireSessionUser } from "@/lib/use-cases/get-session"

export async function addToCartAction(
  variantId: string,
  quantity: number,
  nextPath: string
): Promise<boolean> {
  const user = await requireSessionUser(nextPath)
  try {
    await addToCart(user.id, variantId, quantity)
  } catch (error) {
    if (error instanceof CartValidationError || error instanceof CartVariantNotFoundError) {
      return false
    }
    throw error
  }
  return true
}

export async function updateCartItemQuantityAction(
  cartItemId: string,
  quantity: number
): Promise<void> {
  const user = await requireSessionUser("/panier")
  try {
    await updateCartItemQuantity(user.id, cartItemId, quantity)
  } catch (error) {
    if (error instanceof CartValidationError || error instanceof CartItemNotFoundError) return
    throw error
  }
}

export async function removeCartItemAction(cartItemId: string): Promise<void> {
  const user = await requireSessionUser("/panier")
  try {
    await removeCartItem(user.id, cartItemId)
  } catch (error) {
    if (error instanceof CartItemNotFoundError) return
    throw error
  }
}
