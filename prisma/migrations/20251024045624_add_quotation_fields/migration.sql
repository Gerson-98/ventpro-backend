/*
  Warnings:

  - A unique constraint covering the columns `[quotationNumber]` on the table `Quotation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "quotationNumber" TEXT;

-- AlterTable
ALTER TABLE "QuotationWindow" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");
