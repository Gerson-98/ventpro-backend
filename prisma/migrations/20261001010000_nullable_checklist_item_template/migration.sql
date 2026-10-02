-- Permite items de checklist "dinamicos" (sin plantilla, generados desde
-- el reporte de materiales del pedido) ademas de los fijos configurados
-- a mano por el admin.
ALTER TABLE "checklist_items" DROP CONSTRAINT "checklist_items_template_id_fkey";
ALTER TABLE "checklist_items" ALTER COLUMN "template_id" DROP NOT NULL;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
