ALTER TABLE "window_types" ADD COLUMN "allows_reference_image" BOOLEAN NOT NULL DEFAULT false;
UPDATE "window_types" SET "allows_reference_image" = true WHERE id IN (12, 13);
