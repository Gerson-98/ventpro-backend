-- Mes contable manual del pedido (aditivo; NULL = se usa createdAt)
ALTER TABLE "orders" ADD COLUMN "accountingDate" TIMESTAMP(3);
