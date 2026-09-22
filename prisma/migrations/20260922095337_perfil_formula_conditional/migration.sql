ALTER TABLE "perfil_formulas" ADD COLUMN IF NOT EXISTS "option_group" TEXT;
ALTER TABLE "perfil_formulas" ADD COLUMN IF NOT EXISTS "option_key" TEXT;
ALTER TABLE "perfil_formulas" DROP CONSTRAINT IF EXISTS "perfil_formulas_window_type_id_slot_origen_key";
DROP INDEX IF EXISTS "perfil_formulas_window_type_id_slot_origen_key";
CREATE INDEX IF NOT EXISTS "perfil_formulas_window_type_id_slot_origen_idx" ON "perfil_formulas"("window_type_id", "slot", "origen");
