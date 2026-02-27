/*
  Warnings:

  - You are about to drop the column `perfil_batiente` on the `catalogo_perfiles` table. All the data in the column will be lost.
  - You are about to drop the column `perfil_hoja` on the `catalogo_perfiles` table. All the data in the column will be lost.
  - You are about to drop the column `perfil_marco` on the `catalogo_perfiles` table. All the data in the column will be lost.
  - You are about to drop the column `perfil_mosquitero` on the `catalogo_perfiles` table. All the data in the column will be lost.
  - You are about to drop the column `perfil_tapajamba` on the `catalogo_perfiles` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PERFIL', 'VIDRIO', 'ACCESORIO');

-- AlterTable
ALTER TABLE "catalogo_perfiles" DROP COLUMN "perfil_batiente",
DROP COLUMN "perfil_hoja",
DROP COLUMN "perfil_marco",
DROP COLUMN "perfil_mosquitero",
DROP COLUMN "perfil_tapajamba",
ADD COLUMN     "perfil_batiente_id" INTEGER,
ADD COLUMN     "perfil_hoja_id" INTEGER,
ADD COLUMN     "perfil_marco_id" INTEGER,
ADD COLUMN     "perfil_mosquitero_id" INTEGER,
ADD COLUMN     "perfil_tapajamba_id" INTEGER;

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "price" DOUBLE PRECISION,
    "unit" TEXT,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_name_key" ON "Material"("name");

-- AddForeignKey
ALTER TABLE "catalogo_perfiles" ADD CONSTRAINT "catalogo_perfiles_perfil_marco_id_fkey" FOREIGN KEY ("perfil_marco_id") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_perfiles" ADD CONSTRAINT "catalogo_perfiles_perfil_hoja_id_fkey" FOREIGN KEY ("perfil_hoja_id") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_perfiles" ADD CONSTRAINT "catalogo_perfiles_perfil_mosquitero_id_fkey" FOREIGN KEY ("perfil_mosquitero_id") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_perfiles" ADD CONSTRAINT "catalogo_perfiles_perfil_batiente_id_fkey" FOREIGN KEY ("perfil_batiente_id") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_perfiles" ADD CONSTRAINT "catalogo_perfiles_perfil_tapajamba_id_fkey" FOREIGN KEY ("perfil_tapajamba_id") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
