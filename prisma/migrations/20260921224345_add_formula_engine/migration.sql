-- Motor de fórmulas nuevo para el configurador paso a paso de tipos de
-- ventana. Puramente aditivo: no toca ninguna columna ni tabla existente.
-- window_types.calc_engine default 'legacy' preserva el comportamiento de
-- los 30+ tipos ya en producción sin cambiar nada en ellos.

ALTER TABLE "window_types" ADD COLUMN IF NOT EXISTS "calc_engine" TEXT NOT NULL DEFAULT 'legacy';

CREATE TABLE IF NOT EXISTS "perfil_formulas" (
    "id" SERIAL NOT NULL,
    "window_type_id" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "piezas" INTEGER NOT NULL DEFAULT 2,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "perfil_formulas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "perfil_formulas_window_type_id_slot_origen_key"
ON "perfil_formulas"("window_type_id", "slot", "origen");

ALTER TABLE "perfil_formulas" DROP CONSTRAINT IF EXISTS "perfil_formulas_window_type_id_fkey";
ALTER TABLE "perfil_formulas"
ADD CONSTRAINT "perfil_formulas_window_type_id_fkey"
FOREIGN KEY ("window_type_id") REFERENCES "window_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
