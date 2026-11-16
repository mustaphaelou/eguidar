-- Spec #1031 : le Remboursement rend l'argent contre un Encaissement. La
-- migration est additive : l'énumération du mode, la table `Refund`, sa clé
-- d'idempotence unique, les index de lecture, les clés étrangères et le CHECK
-- de montant positif. Aucune ligne de Commande, d'Encaissement ou de Retour
-- n'est écrite, supprimée ou réécrite.

-- CreateEnum
CREATE TYPE "RefundMode" AS ENUM ('cash', 'transfer');

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "returnId" TEXT,
    "amount" INTEGER NOT NULL,
    "mode" "RefundMode" NOT NULL,
    "refundedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedById" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_returnId_idx" ON "Refund"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- Un Remboursement rend de l'argent : son montant est strictement positif.
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive"
  CHECK ("amount" > 0);

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
