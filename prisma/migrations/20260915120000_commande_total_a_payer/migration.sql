-- AlterTable
ALTER TABLE "Order" ADD COLUMN "totalPayable" INTEGER;

-- Backfill the persisted Total à payer from the canonical arithmetic:
-- Sous-total (Order.total) + Frais de livraison (Order.shippingFee).
UPDATE "Order" SET "totalPayable" = "total" + "shippingFee";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "totalPayable" SET NOT NULL;
