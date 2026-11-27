-- CreateTable
CREATE TABLE "Annonce" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL DEFAULT '',
    "lienUrl" TEXT,
    "lienLibelle" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Annonce_pkey" PRIMARY KEY ("id")
);
