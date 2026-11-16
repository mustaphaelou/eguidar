-- Spec #1025 / #1028 : la livraison enregistre sa date, son Encaissement et son
-- Changement de statut. La migration est strictement additive : une colonne,
-- deux tables, et un backfill rejouable des Commandes déjà Livrée.
-- Aucune histoire n'est inventée : OrderStatusChange reste vide au backfill.

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash_on_delivery');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'cash_on_delivery',
    "collectedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusChange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,

    CONSTRAINT "OrderStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusChange_orderId_changedAt_idx" ON "OrderStatusChange"("orderId", "changedAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusChange" ADD CONSTRAINT "OrderStatusChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusChange" ADD CONSTRAINT "OrderStatusChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill : chaque Commande déjà Livrée reçoit deliveredAt = updatedAt et un
-- Encaissement de son Total à payer, en Paiement à la livraison, sans acteur.
-- Chaque Commande Retournée reste sans ligne d'argent : le Statut d'alors ne
-- prouve pas qu'elle fut livrée.
-- Le bloc est une seule instruction et se garde par NOT EXISTS : le test de la
-- migration l'extrait et l'exécute deux fois sans dupliquer d'Encaissement.
-- backfill début
WITH "livraisons_sans_date" AS (
    UPDATE "Order"
    SET "deliveredAt" = "updatedAt"
    WHERE "status" = 'delivered' AND "deliveredAt" IS NULL
    RETURNING "id"
)
INSERT INTO "Payment" ("id", "orderId", "amount", "mode", "collectedAt", "recordedById", "createdAt")
SELECT gen_random_uuid()::text, o."id", o."totalPayable", 'cash_on_delivery', o."updatedAt", NULL, CURRENT_TIMESTAMP
FROM "Order" o
WHERE o."status" = 'delivered'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" p WHERE p."orderId" = o."id"
  );
-- backfill fin
