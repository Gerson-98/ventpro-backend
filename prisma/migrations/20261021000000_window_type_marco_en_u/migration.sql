-- AlterTable: marca los tipos de ventana cuyo marco se corta en "U"
-- (2 verticales + travesaño superior, sin pieza inferior). Aditivo: default false.
ALTER TABLE "window_types" ADD COLUMN "marco_en_u" BOOLEAN NOT NULL DEFAULT false;
