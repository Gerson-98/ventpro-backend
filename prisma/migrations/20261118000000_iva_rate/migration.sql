-- Tasa de IVA configurable (5% o 12%). Default 5 = comportamiento actual.
ALTER TABLE "Quotation" ADD COLUMN "iva_rate" DOUBLE PRECISION NOT NULL DEFAULT 5;
ALTER TABLE "orders" ADD COLUMN "iva_rate" DOUBLE PRECISION NOT NULL DEFAULT 5;
