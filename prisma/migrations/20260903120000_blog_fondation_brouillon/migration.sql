-- CreateEnum
CREATE TYPE "StatutPublication" AS ENUM ('brouillon', 'publie', 'archive');

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleBlog" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "extrait" TEXT NOT NULL,
    "couverture" TEXT,
    "contenu" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "statut" "StatutPublication" NOT NULL DEFAULT 'brouillon',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleBlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleBlogProduit" (
    "articleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleBlogProduit_pkey" PRIMARY KEY ("articleId", "productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Theme_slug_key" ON "Theme"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_nom_key" ON "Theme"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleBlog_slug_key" ON "ArticleBlog"("slug");

-- CreateIndex
CREATE INDEX "ArticleBlog_statut_publishedAt_idx" ON "ArticleBlog"("statut", "publishedAt");

-- CreateIndex
CREATE INDEX "ArticleBlog_themeId_idx" ON "ArticleBlog"("themeId");

-- CreateIndex
CREATE INDEX "ArticleBlogProduit_productId_idx" ON "ArticleBlogProduit"("productId");

-- AddForeignKey
ALTER TABLE "ArticleBlog" ADD CONSTRAINT "ArticleBlog_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleBlogProduit" ADD CONSTRAINT "ArticleBlogProduit_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleBlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleBlogProduit" ADD CONSTRAINT "ArticleBlogProduit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed owned theme list (Guides, Annonces), idempotent
INSERT INTO "Theme" ("id", "slug", "nom", "createdAt", "updatedAt")
VALUES ('theme-guides', 'guides', 'Guides', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO "Theme" ("id", "slug", "nom", "createdAt", "updatedAt")
VALUES ('theme-annonces', 'annonces', 'Annonces', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
