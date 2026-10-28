-- ADR-0041 : les effets post-commit deviennent des automatisations durables.
-- Migration strictement additive : elle ne touche aucune table existante, et
-- aucun retour arrière n'efface un événement déjà consommé.

-- CreateEnum
CREATE TYPE "StatutAutomation" AS ENUM ('en_attente', 'en_cours', 'reussi', 'echoue', 'ignore', 'mort');

-- CreateEnum
CREATE TYPE "DeclencheurExecution" AS ENUM ('evenement', 'planification', 'manuel');

-- CreateTable
CREATE TABLE "AutomationEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "attemptOf" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "StatutAutomation" NOT NULL DEFAULT 'en_attente',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "actionConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleRevision" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRuleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "ruleId" TEXT,
    "action" TEXT NOT NULL,
    "status" "StatutAutomation" NOT NULL DEFAULT 'en_cours',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "trigger" "DeclencheurExecution" NOT NULL DEFAULT 'evenement',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationEvent_status_availableAt_idx" ON "AutomationEvent"("status", "availableAt");

-- CreateIndex
-- La clé naturelle de l'écrivain : un même (type, entité, tentative) ne peut
-- pas produire deux événements. Le webhook d'écriture peut donc être rejoué.
CREATE UNIQUE INDEX "AutomationEvent_type_entityId_attemptOf_key" ON "AutomationEvent"("type", "entityId", "attemptOf");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEvent_entityType_entityId_seq_key" ON "AutomationEvent"("entityType", "entityId", "seq");

-- CreateIndex
CREATE INDEX "AutomationRuleRevision_ruleId_createdAt_idx" ON "AutomationRuleRevision"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_startedAt_idx" ON "AutomationRun"("startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_eventId_ruleId_attempt_key" ON "AutomationRun"("eventId", "ruleId", "attempt");

-- AddForeignKey
ALTER TABLE "AutomationRuleRevision" ADD CONSTRAINT "AutomationRuleRevision_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AutomationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
