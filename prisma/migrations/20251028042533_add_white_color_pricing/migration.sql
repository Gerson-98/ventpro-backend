/*
  Warnings:

  - You are about to drop the column `price` on the `Material` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Material" DROP COLUMN "price",
ADD COLUMN     "price_color" DOUBLE PRECISION,
ADD COLUMN     "price_white" DOUBLE PRECISION;
