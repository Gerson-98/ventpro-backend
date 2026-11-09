-- Precio final congelado del pedido (aditivo, no toca datos existentes)
ALTER TABLE "orders" ADD COLUMN "priceLocked" BOOLEAN NOT NULL DEFAULT false;
