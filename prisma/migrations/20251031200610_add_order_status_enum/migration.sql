/*
  Warnings:

  - The `status` column on the `orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('EN_PROCESO', 'EN_FABRICACION', 'LISTO_PARA_INSTALAR', 'EN_RUTA', 'COMPLETADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" DEFAULT 'EN_PROCESO';
