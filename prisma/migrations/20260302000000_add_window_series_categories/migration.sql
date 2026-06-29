-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ UP MIGRATION: Agregar Series y Categorías de ventanas                   │
-- │                                                                         │
-- │ DOWN (para revertir completamente):                                     │
-- │   ALTER TABLE "window_types"                                            │
-- │     DROP COLUMN IF EXISTS "series_id",                                  │
-- │     DROP COLUMN IF EXISTS "category_id";                                │
-- │   DROP TABLE IF EXISTS "series_categories";                             │
-- │   DROP TABLE IF EXISTS "window_categories";                             │
-- │   DROP TABLE IF EXISTS "window_series";                                 │
-- └─────────────────────────────────────────────────────────────────────────┘

-- CreateTable: Catálogo de series (SERIE 60, SERIE 80, SERIE 88, SERIE DELUXE, …)
CREATE TABLE "window_series" (
    "id"          SERIAL          NOT NULL,
    "name"        TEXT            NOT NULL,
    "displayName" TEXT,
    "sort_order"  INTEGER         NOT NULL DEFAULT 0,
    "active"      BOOLEAN         NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "window_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "window_series_name_key" ON "window_series"("name");

-- CreateTable: Catálogo de categorías (Ventana Corrediza, Puerta Corrediza, …)
CREATE TABLE "window_categories" (
    "id"          SERIAL          NOT NULL,
    "name"        TEXT            NOT NULL,
    "displayName" TEXT,
    "sort_order"  INTEGER         NOT NULL DEFAULT 0,
    "active"      BOOLEAN         NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "window_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "window_categories_name_key" ON "window_categories"("name");

-- CreateTable: Relación N:M Serie ↔ Categoría
-- Define qué categorías están disponibles en cada serie
CREATE TABLE "series_categories" (
    "id"          SERIAL  NOT NULL,
    "series_id"   INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "sort_order"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "series_categories_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "series_categories_series_id_fkey"
        FOREIGN KEY ("series_id")
        REFERENCES "window_series"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "series_categories_category_id_fkey"
        FOREIGN KEY ("category_id")
        REFERENCES "window_categories"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "series_categories_series_id_category_id_key"
    ON "series_categories"("series_id", "category_id");

-- AlterTable: Agregar series_id y category_id a window_types
-- AMBOS NULLABLE → los 21 tipos existentes quedan con NULL hasta el seed
ALTER TABLE "window_types"
    ADD COLUMN "series_id"    INTEGER,
    ADD COLUMN "category_id"  INTEGER;

-- AddForeignKey: window_types → window_series (SET NULL al borrar serie)
ALTER TABLE "window_types"
    ADD CONSTRAINT "window_types_series_id_fkey"
        FOREIGN KEY ("series_id")
        REFERENCES "window_series"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: window_types → window_categories (SET NULL al borrar categoría)
ALTER TABLE "window_types"
    ADD CONSTRAINT "window_types_category_id_fkey"
        FOREIGN KEY ("category_id")
        REFERENCES "window_categories"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
