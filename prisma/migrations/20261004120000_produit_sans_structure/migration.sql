-- Un Produit survit à la suppression de sa Structure (ADR-0029, #522).
ALTER TABLE "Product" ALTER COLUMN "categoryId" DROP NOT NULL;
