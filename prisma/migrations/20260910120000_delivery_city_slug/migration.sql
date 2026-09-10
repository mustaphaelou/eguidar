-- AlterTable
ALTER TABLE "DeliveryCity" ADD COLUMN "slug" TEXT;

-- Backfill slug from name. Mirrors `slugify` (lib/slug.ts): case folded,
-- diacritics folded, non-alphanumerics -> hyphens, trimmed.
--
-- The translate() mapping lists every NFD-decomposable Latin letter (both
-- cases, generated from Unicode NFD data) so folding does not depend on the
-- database locale. Non-decomposable letters (æ, œ, ø, ß…) are deliberately
-- left out: the generator yields hyphens/trim for them, so mapping them
-- would drift. Translation runs before lower() so accented uppercase never
-- goes through locale-sensitive lowercasing.
--
-- Collisions (e.g. « Kénitra » / « Kenitra ») and names folding to nothing
-- are resolved deterministically: 'base' falls back to 'ville' when empty,
-- then duplicate bases are numbered by "createdAt" then "id" —
-- base, base-2, base-3… — before the unique index is created.
WITH "normalise" AS (
  SELECT
    "id",
    "createdAt",
    COALESCE(
      NULLIF(
        btrim(
          regexp_replace(
            lower(
              translate(
                "name",
                'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳḀḁḂḃḄḅḆḇḈḉḊḋḌḍḎḏḐḑḒḓḔḕḖḗḘḙḚḛḜḝḞḟḠḡḢḣḤḥḦḧḨḩḪḫḬḭḮḯḰḱḲḳḴḵḶḷḸḹḺḻḼḽḾḿṀṁṂṃṄṅṆṇṈṉṊṋṌṍṎṏṐṑṒṓṔṕṖṗṘṙṚṛṜṝṞṟṠṡṢṣṤṥṦṧṨṩṪṫṬṭṮṯṰṱṲṳṴṵṶṷṸṹṺṻṼṽṾṿẀẁẂẃẄẅẆẇẈẉẊẋẌẍẎẏẐẑẒẓẔẕẖẗẘẙẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ',
                'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZzOoUuAaIiOoUuUuUuUuUuAaAaGgKkOoOojGgNnAaAaAaEeEeIiIiOoOoRrRrUuUuSsTtHhAaEeOoOoOoOoYyAaBbBbBbCcDdDdDdDdDdEeEeEeEeEeFfGgHhHhHhHhHhIiIiKkKkKkLlLlLlLlMmMmMmNnNnNnNnOoOoOoOoPpPpRrRrRrRrSsSsSsSsSsTtTtTtTtUuUuUuUuUuVvVvWwWwWwWwWwXxXxYyZzZzZzhtwyAaAaAaAaAaAaAaAaAaAaAaAaEeEeEeEeEeEeEeEeIiIiOoOoOoOoOoOoOoOoOoOoOoOoUuUuUuUuUuUuUuYyYyYyYy'
              )
            ),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          '-'
        ),
        ''
      ),
      'ville'
    ) AS "base"
  FROM "DeliveryCity"
),
"numbers" AS (
  SELECT
    "id",
    "base",
    row_number() OVER (
      PARTITION BY "base"
      ORDER BY "createdAt", "id"
    ) AS "rang"
  FROM "normalise"
)
UPDATE "DeliveryCity"
SET "slug" = CASE
  WHEN "numbers"."rang" = 1 THEN "numbers"."base"
  ELSE "numbers"."base" || '-' || "numbers"."rang"
END
FROM "numbers"
WHERE "DeliveryCity"."id" = "numbers"."id";

-- AlterTable
ALTER TABLE "DeliveryCity" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCity_slug_key" ON "DeliveryCity"("slug");
