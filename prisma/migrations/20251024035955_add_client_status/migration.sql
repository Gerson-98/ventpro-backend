-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('Potencial', 'Contactado', 'Interesado', 'En_Seguimiento', 'Cliente_Activo', 'No_Interesado', 'Importante');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'Potencial';
