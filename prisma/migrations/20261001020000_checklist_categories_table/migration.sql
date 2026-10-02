-- Reemplaza el enum fijo ChecklistType por una tabla configurable —
-- el admin puede crear categorias de checklist nuevas sin migraciones.

CREATE TABLE "checklist_categories" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT '📋',
  "dynamic" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

INSERT INTO "checklist_categories" ("id", "slug", "label", "icon", "dynamic", "sort_order", "updatedAt") VALUES
  (1, 'carga_camion', 'Carga de Camión', '🚛', true, 0, CURRENT_TIMESTAMP),
  (2, 'verificacion_instalacion', 'Verificación de Instalación', '🔧', false, 1, CURRENT_TIMESTAMP),
  (3, 'regreso', 'Regreso', '↩️', false, 2, CURRENT_TIMESTAMP);
SELECT setval(pg_get_serial_sequence('"checklist_categories"', 'id'), 3, true);

-- checklist_templates: type (enum) -> category_id (FK)
ALTER TABLE "checklist_templates" ADD COLUMN "category_id" INTEGER;
UPDATE "checklist_templates" SET "category_id" = CASE "type"
  WHEN 'carga_camion' THEN 1
  WHEN 'verificacion_instalacion' THEN 2
  WHEN 'regreso' THEN 3
END;
ALTER TABLE "checklist_templates" ALTER COLUMN "category_id" SET NOT NULL;
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "checklist_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_templates" DROP COLUMN "type";

-- checklists: type (enum) -> category_id (FK)
DROP INDEX IF EXISTS "checklists_order_id_type_key";
ALTER TABLE "checklists" ADD COLUMN "category_id" INTEGER;
UPDATE "checklists" SET "category_id" = CASE "type"
  WHEN 'carga_camion' THEN 1
  WHEN 'verificacion_instalacion' THEN 2
  WHEN 'regreso' THEN 3
END;
ALTER TABLE "checklists" ALTER COLUMN "category_id" SET NOT NULL;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "checklist_categories"("id") ON UPDATE CASCADE;
ALTER TABLE "checklists" DROP COLUMN "type";
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_order_id_category_id_key" UNIQUE ("order_id", "category_id");
