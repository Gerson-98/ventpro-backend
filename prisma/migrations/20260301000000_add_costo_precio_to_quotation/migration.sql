-- AlterTable: persist computed cost and suggested price at quotation save time.
-- Both are nullable so existing rows remain valid; values backfill the next
-- time each quotation is updated through the application.
ALTER TABLE "Quotation"
  ADD COLUMN "costo_total_proyecto"    DOUBLE PRECISION,
  ADD COLUMN "precio_sugerido_minimo"  DOUBLE PRECISION;
