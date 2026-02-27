-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "include_iva" BOOLEAN NOT NULL DEFAULT false;
