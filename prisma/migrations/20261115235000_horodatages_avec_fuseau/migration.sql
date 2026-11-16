-- ADR-0057 : chaque horodatage du schéma porte son fuseau.
--
-- Les colonnes étaient des `timestamp(3)` sans fuseau, écrites jusqu'ici à
-- l'heure de l'application (le serveur tourne en UTC). La conversion lit
-- chaque valeur comme un instant UTC : `USING … AT TIME ZONE 'UTC'` est
-- explicite, là où un `SET DATA TYPE` nu dépendrait du `TimeZone` de la
-- session qui applique la migration.
--
-- Une seule migration, une seule transaction : toutes les colonnes
-- temporelles de `public` passent en `timestamptz(3)`. Aucun appelant ne
-- change — Prisma rend un `DateTime` dans les deux cas. La table
-- `_prisma_migrations` est déjà en `timestamptz` et n'est pas touchée.
--
-- Coût : chaque `ALTER TABLE` réécrit sa table et prend un verrou exclusif.
-- La base restaurée du point de restauration vérifié a servi d'abord à
-- mesurer la conversion (121 lignes) ; le déploiement la rejoue ensuite.

-- user (2 colonnes)
ALTER TABLE "user"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "user"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- session (3 colonnes)
ALTER TABLE "session"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "session"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "session"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- account (4 colonnes)
ALTER TABLE "account"
  ALTER COLUMN "accessTokenExpiresAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "accessTokenExpiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "account"
  ALTER COLUMN "refreshTokenExpiresAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "refreshTokenExpiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "account"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "account"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- verification (3 colonnes)
ALTER TABLE "verification"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "verification"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "verification"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- Category (2 colonnes)
ALTER TABLE "Category"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Category"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- Product (2 colonnes)
ALTER TABLE "Product"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Product"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- ProductVariant (2 colonnes)
ALTER TABLE "ProductVariant"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "ProductVariant"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- BrouillonImageProduit (2 colonnes)
ALTER TABLE "BrouillonImageProduit"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "BrouillonImageProduit"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "expiresAt" AT TIME ZONE 'UTC';

-- ImageProduit (1 colonne)
ALTER TABLE "ImageProduit"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';

-- CartItem (2 colonnes)
ALTER TABLE "CartItem"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "CartItem"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- Order (2 colonnes)
ALTER TABLE "Order"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Order"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- OrderItem (1 colonne)
ALTER TABLE "OrderItem"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';

-- DeliveryCity (2 colonnes)
ALTER TABLE "DeliveryCity"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "DeliveryCity"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- ShippingSettings (1 colonne)
ALTER TABLE "ShippingSettings"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- Theme (2 colonnes)
ALTER TABLE "Theme"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Theme"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- ArticleBlog (3 colonnes)
ALTER TABLE "ArticleBlog"
  ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "publishedAt" AT TIME ZONE 'UTC';
ALTER TABLE "ArticleBlog"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "ArticleBlog"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- AutomationEvent (6 colonnes)
ALTER TABLE "AutomationEvent"
  ALTER COLUMN "occurredAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "occurredAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationEvent"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationEvent"
  ALTER COLUMN "availableAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "availableAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationEvent"
  ALTER COLUMN "lockedUntil" SET DATA TYPE TIMESTAMPTZ(3)
  USING "lockedUntil" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationEvent"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationEvent"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- AutomationRule (2 colonnes)
ALTER TABLE "AutomationRule"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationRule"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- AutomationRuleRevision (1 colonne)
ALTER TABLE "AutomationRuleRevision"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';

-- AutomationRun (3 colonnes)
ALTER TABLE "AutomationRun"
  ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "startedAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationRun"
  ALTER COLUMN "finishedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "finishedAt" AT TIME ZONE 'UTC';
ALTER TABLE "AutomationRun"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';

-- LotImport (2 colonnes)
ALTER TABLE "LotImport"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "LotImport"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';

-- LigneImport (2 colonnes)
ALTER TABLE "LigneImport"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "LigneImport"
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'UTC';
