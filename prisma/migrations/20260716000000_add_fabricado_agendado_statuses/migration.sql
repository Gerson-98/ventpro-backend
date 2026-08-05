-- Agrega los estados 'fabricado' y 'agendado' al flujo de pedidos, y las
-- columnas para el nuevo Calendario de Instalación (independiente del
-- Calendario de Fabricación, que reutiliza las columnas installationStartDate/
-- EndDate existentes bajo el nombre Prisma fabricationStartDate/EndDate).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'fabricado'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'fabricado';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'agendado'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'agendado';
  END IF;
END$$;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "realInstallationStartDate" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "realInstallationEndDate" TIMESTAMP(3);

-- Migra el único pedido legado en 'listo_para_instalar' → 'fabricado'
-- (ya tenía fecha agendada bajo el significado viejo del campo, equivalente
-- a "ya salió de fabricación, pendiente de agendar instalación real").
UPDATE "orders" SET status = 'fabricado' WHERE status = 'listo_para_instalar';
