-- Purge des images placeholder « placehold.co » du Catalogue.
--
-- Règle d'extraction de l'hôte : une URL est reconnue par son schéma
-- (`http://`, `https://`, ou tout autre schéma valide) ; l'autorité qui suit
-- est isolée jusqu'au premier `/`, `?` ou `#`. Les éventuels identifiants
-- (`utilisateur:motdepasse@`) sont ignorés, puis le port (après le premier
-- `:`) est retiré. L'hôte obtenu est comparé sans distinction de casse et
-- correspond à `placehold.co` ou à l'un de ses sous-domaines
-- (`www.placehold.co`, `images.placehold.co`, …).
--
-- Ce fichier est idempotent : une seconde exécution ne réécrit aucune ligne
-- (`WHERE … IS DISTINCT FROM …` pour les Produits, `image IS NOT NULL` pour
-- les Catégories).

-- Product.images (JSONB) : retire chaque entrée textuelle dont l'hôte est
-- placehold.co, préserve toutes les autres entrées dans leur ordre d'origine
-- et laisse une liste entièrement purgée sous forme de tableau vide.
-- Les entrées non textuelles (objets, nombres, …) sont laissées intactes.

WITH parsed AS (
  SELECT
    p."id" AS product_id,
    entry,
    ord,
    COALESCE(
      lower((regexp_match(entry #>> '{}', '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/?#]*@)?([^/?#:]+)'))[1]),
      ''
    ) AS host
  FROM "Product" AS p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p."images") = 'array' THEN p."images" ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS elements(entry, ord)
),
purged AS (
  SELECT
    product_id,
    jsonb_agg(entry ORDER BY ord) FILTER (
      WHERE host <> 'placehold.co' AND host NOT LIKE '%.placehold.co'
    ) AS images
  FROM parsed
  GROUP BY product_id
)
UPDATE "Product" AS p
SET "images" = COALESCE(purged.images, '[]'::jsonb)
FROM purged
WHERE p."id" = purged.product_id
  AND p."images" IS DISTINCT FROM COALESCE(purged.images, '[]'::jsonb);

-- Category.image (TEXT) : une URL dont l'hôte est placehold.co devient NULL.

WITH parsed AS (
  SELECT
    c."id" AS category_id,
    COALESCE(
      lower((regexp_match(c."image", '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/?#]*@)?([^/?#:]+)'))[1]),
      ''
    ) AS host
  FROM "Category" AS c
  WHERE c."image" IS NOT NULL
)
UPDATE "Category" AS c
SET "image" = NULL
FROM parsed
WHERE c."id" = parsed.category_id
  AND (parsed.host = 'placehold.co' OR parsed.host LIKE '%.placehold.co');
