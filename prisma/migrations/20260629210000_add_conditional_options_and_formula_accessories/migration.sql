-- Opciones condicionales: un OptionValue puede depender de otro grupo/valor
ALTER TABLE "option_values" ADD COLUMN "depends_on_group_key" TEXT;
ALTER TABLE "option_values" ADD COLUMN "depends_on_value_key" TEXT;
ALTER TABLE "option_values" ADD COLUMN "forces_mosquitero" BOOLEAN;

-- Accesorios con cantidad calculada por formula (barras/m2) en vez de fija
ALTER TABLE "AccessoryRule" ADD COLUMN "formula_type" TEXT;
ALTER TABLE "AccessoryRule" ADD COLUMN "formula_slot" TEXT;
ALTER TABLE "AccessoryRule" ADD COLUMN "formula_factor" DOUBLE PRECISION;
