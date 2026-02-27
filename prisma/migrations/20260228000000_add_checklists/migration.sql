CREATE TYPE "ChecklistType" AS ENUM ('carga_camion', 'verificacion_instalacion', 'regreso');

CREATE TABLE "checklist_templates" (
    "id" SERIAL PRIMARY KEY,
    "type" "ChecklistType" NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "checklists" (
    "id" SERIAL PRIMARY KEY,
    "type" "ChecklistType" NOT NULL,
    "order_id" INTEGER NOT NULL,
    "completed_by_id" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "checklists_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
    CONSTRAINT "checklists_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id")
);

CREATE UNIQUE INDEX "checklists_order_id_type_key" ON "checklists"("order_id", "type");

CREATE TABLE "checklist_items" (
    "id" SERIAL PRIMARY KEY,
    "checklist_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE,
    CONSTRAINT "checklist_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id")
);