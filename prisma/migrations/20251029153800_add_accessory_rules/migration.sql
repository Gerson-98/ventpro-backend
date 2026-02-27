-- CreateTable
CREATE TABLE "AccessoryRule" (
    "id" SERIAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "option_group" TEXT,
    "option_key" TEXT,
    "window_type_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,

    CONSTRAINT "AccessoryRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AccessoryRule" ADD CONSTRAINT "AccessoryRule_window_type_id_fkey" FOREIGN KEY ("window_type_id") REFERENCES "window_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryRule" ADD CONSTRAINT "AccessoryRule_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
