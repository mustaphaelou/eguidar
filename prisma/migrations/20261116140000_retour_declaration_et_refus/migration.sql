-- Spec #1029 : un Retour se déclare et se refuse, sans toucher au stock ni à
-- l'argent. La migration est additive : les énumérations du Retour, les tables
-- `Return` et `ReturnLine`, la date de livraison que lit la fenêtre de
-- rétractation, l'index partiel qui rend une double demande ouverte
-- impossible, et les deux CHECK de quantité. Aucune ligne de Commande, de
-- Variante ou de Statut de commande n'est écrite.
--
-- Prisma ne modélise ni les index partiels ni les CHECK : ils sont écrits à la
-- main, comme l'index du Lot d'import en cours. Le schéma ne porte pas
-- l'index partiel ; la base en reste la seule propriétaire.

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('requested', 'received', 'refused');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('withdrawal', 'non_conformity', 'goodwill', 'other');

-- CreateEnum
CREATE TYPE "ReturnRefusalCode" AS ENUM ('out_of_window', 'excluded_by_law', 'not_received', 'condition_mismatch', 'other');

-- CreateEnum
CREATE TYPE "ReturnLineCondition" AS ENUM ('resellable', 'damaged');

-- La fenêtre de sept jours se lit sur la livraison, jamais sur `updatedAt`.
-- La colonne arrive ici avec le fait de livraison de #1028.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'requested',
    "reason" "ReturnReason" NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3),
    "refusalCode" "ReturnRefusalCode",
    "refusalNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "declaredQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER,
    "condition" "ReturnLineCondition",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Return_orderId_idx" ON "Return"("orderId");

-- CreateIndex
CREATE INDEX "ReturnLine_orderItemId_idx" ON "ReturnLine"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnLine_returnId_orderItemId_key" ON "ReturnLine"("returnId", "orderItemId");

-- Spec #1029 : au plus une demande ouverte par Commande. La garantie est
-- l'index partiel lui-même, pas une lecture préalable : deux créations
-- concurrentes ne peuvent pas passer toutes deux une demande `requested`. Le
-- nom est celui que le cas d'usage reconnaît dans une violation P2002.
CREATE UNIQUE INDEX "Return_orderId_ouvert_key"
  ON "Return" ("orderId")
  WHERE "status" = 'requested';

-- Spec #1029 : la quantité déclarée est strictement positive, et la quantité
-- reçue — quand elle existe — reste entre zéro et la déclarée.
ALTER TABLE "ReturnLine"
  ADD CONSTRAINT "ReturnLine_declaredQuantity_positive"
  CHECK ("declaredQuantity" > 0);

ALTER TABLE "ReturnLine"
  ADD CONSTRAINT "ReturnLine_receivedQuantity_bornee"
  CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "declaredQuantity");

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
