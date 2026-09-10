-- AlterTable
ALTER TABLE "DeliveryCity" ADD COLUMN "slug" TEXT;

-- Backfill slug from name (lowercase, accents folded, non-alphanumerics -> hyphens)
UPDATE "DeliveryCity"
SET "slug" = btrim(
  regexp_replace(
    translate(
      lower("name"),
      'àâäáãåçéèêëîïíìôöóòõûüúùñ',
      'aaaaaaceeeeiiiiooooouuuun'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ),
  '-'
);

-- AlterTable
ALTER TABLE "DeliveryCity" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCity_slug_key" ON "DeliveryCity"("slug");
