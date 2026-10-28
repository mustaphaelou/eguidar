-- Les notes de bas de page d'un Article de blog vivent dans leur propre colonne (#800).
ALTER TABLE "ArticleBlog" ADD COLUMN "notes" TEXT;
