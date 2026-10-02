-- Enlaza cada Window con el QuotationWindow del que nació, para poder
-- sincronizar medidas editadas desde el Pedido de vuelta a la Cotización.
ALTER TABLE "windows" ADD COLUMN "quotation_window_id" INTEGER;

ALTER TABLE "windows" ADD CONSTRAINT "windows_quotation_window_id_fkey"
  FOREIGN KEY ("quotation_window_id") REFERENCES "QuotationWindow"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
