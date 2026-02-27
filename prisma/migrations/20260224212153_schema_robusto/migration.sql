-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('en_proceso', 'confirmado');

-- DropForeignKey
ALTER TABLE "public"."AccessoryRule" DROP CONSTRAINT "AccessoryRule_window_type_id_fkey";

-- DropIndex
DROP INDEX "public"."catalogo_perfiles_tipo_ventana_key";

-- PASO 1: Rellenar NULLs antes de hacer columnas NOT NULL
UPDATE "orders" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
UPDATE "orders" SET "status" = 'EN_PROCESO' WHERE "status" IS NULL;
UPDATE "windows" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- PASO 2: Migrar status de Quotation preservando datos
ALTER TABLE "Quotation" ADD COLUMN "status_new" "QuotationStatus" NOT NULL DEFAULT 'en_proceso';
UPDATE "Quotation" SET "status_new" = 'confirmado' WHERE "status" = 'confirmado';
ALTER TABLE "Quotation" DROP COLUMN "status";
ALTER TABLE "Quotation" RENAME COLUMN "status_new" TO "status";

-- PASO 3: Agregar window_type_id como nullable (la tabla no puede estar vacia con NOT NULL)
ALTER TABLE "catalogo_perfiles" ADD COLUMN "window_type_id" INTEGER;

-- PASO 4: Poblar window_type_id ANTES de eliminar tipo_ventana
UPDATE "catalogo_perfiles" cp
SET "window_type_id" = wt.id
FROM "window_types" wt
WHERE cp.tipo_ventana = wt.name;

-- PASO 5: Ahora si eliminamos las columnas basura incluida tipo_ventana
ALTER TABLE "catalogo_perfiles"
  DROP COLUMN "accesorios",
  DROP COLUMN "bisagras",
  DROP COLUMN "cerrojos",
  DROP COLUMN "chapa",
  DROP COLUMN "demas_accesorios",
  DROP COLUMN "rodo_mosquitero",
  DROP COLUMN "rodos",
  DROP COLUMN "tipo_ventana";

-- PASO 6: Hacer window_type_id NOT NULL ahora que ya tiene datos
ALTER TABLE "catalogo_perfiles" ALTER COLUMN "window_type_id" SET NOT NULL;

-- PASO 7: Agregar material_id a glassColor
ALTER TABLE "glassColor" ADD COLUMN "material_id" INTEGER;

-- PASO 8: Hacer NOT NULL las columnas que ya tienen datos
ALTER TABLE "orders" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "windows" ALTER COLUMN "updatedAt" SET NOT NULL;

-- PASO 9: Indices unicos
CREATE UNIQUE INDEX "catalogo_perfiles_window_type_id_key" ON "catalogo_perfiles"("window_type_id");
CREATE UNIQUE INDEX "glassColor_name_key" ON "glassColor"("name");
CREATE UNIQUE INDEX "window_types_name_key" ON "window_types"("name");

-- PASO 10: Foreign keys
ALTER TABLE "glassColor" ADD CONSTRAINT "glassColor_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "catalogo_perfiles" ADD CONSTRAINT "catalogo_perfiles_window_type_id_fkey"
  FOREIGN KEY ("window_type_id") REFERENCES "window_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccessoryRule" ADD CONSTRAINT "AccessoryRule_window_type_id_fkey"
  FOREIGN KEY ("window_type_id") REFERENCES "window_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;