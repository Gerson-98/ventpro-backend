-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ SEED: Series, Categorías y clasificación de los 21 tipos existentes     │
-- │                                                                         │
-- │ PREREQUISITO: Ejecutar DESPUÉS de la migration                          │
-- │   20260302000000_add_window_series_categories                           │
-- │                                                                         │
-- │ SEGURIDAD:                                                              │
-- │  • INSERT ... ON CONFLICT DO NOTHING → idempotente, seguro re-ejecutar  │
-- │  • UPDATE solo asigna series_id / category_id, no toca ningún otro      │
-- │    campo de window_types (ni name, ni displayName, ni description)      │
-- │  • Los tipos con series_id = NULL quedan SIN clasificar hasta que       │
-- │    el admin los asigne desde el panel (MARCO FIJO, ABATIBLE, PROYECTABLE│
-- └─────────────────────────────────────────────────────────────────────────┘

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 1: SERIES
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO "window_series" ("name", "displayName", "sort_order") VALUES
    ('SERIE 60',     'Serie 60',     1),
    ('SERIE 80',     'Serie 80',     2),
    ('SERIE 88',     'Serie 88',     3),
    ('SERIE DELUXE', 'Serie Deluxe', 4)
ON CONFLICT ("name") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2: CATEGORÍAS
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO "window_categories" ("name", "displayName", "sort_order") VALUES
    ('VENTANA CORREDIZA',   'Ventana Corrediza',   1),
    ('PUERTA CORREDIZA',    'Puerta Corrediza',    2),
    ('MARCO FIJO',          'Marco Fijo',          3),
    ('VENTANA ABATIBLE',    'Ventana Abatible',    4),
    ('VENTANA PROYECTABLE', 'Ventana Proyectable', 5),
    ('PUERTA ABATIBLE',     'Puerta Abatible',     6)
ON CONFLICT ("name") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 3: VÍNCULOS SERIE ↔ CATEGORÍA
-- (define qué categorías ofrece cada serie en el selector del modal)
-- ═══════════════════════════════════════════════════════════════════════════

-- SERIE 60 → Ventana Corrediza, Puerta Corrediza
INSERT INTO "series_categories" ("series_id", "category_id", "sort_order")
SELECT s.id, c.id, 1
FROM "window_series" s CROSS JOIN "window_categories" c
WHERE s.name = 'SERIE 60' AND c.name = 'VENTANA CORREDIZA'
ON CONFLICT ("series_id", "category_id") DO NOTHING;

INSERT INTO "series_categories" ("series_id", "category_id", "sort_order")
SELECT s.id, c.id, 2
FROM "window_series" s CROSS JOIN "window_categories" c
WHERE s.name = 'SERIE 60' AND c.name = 'PUERTA CORREDIZA'
ON CONFLICT ("series_id", "category_id") DO NOTHING;

-- SERIE 80 → Ventana Corrediza, Puerta Corrediza
INSERT INTO "series_categories" ("series_id", "category_id", "sort_order")
SELECT s.id, c.id, 1
FROM "window_series" s CROSS JOIN "window_categories" c
WHERE s.name = 'SERIE 80' AND c.name = 'VENTANA CORREDIZA'
ON CONFLICT ("series_id", "category_id") DO NOTHING;

INSERT INTO "series_categories" ("series_id", "category_id", "sort_order")
SELECT s.id, c.id, 2
FROM "window_series" s CROSS JOIN "window_categories" c
WHERE s.name = 'SERIE 80' AND c.name = 'PUERTA CORREDIZA'
ON CONFLICT ("series_id", "category_id") DO NOTHING;

-- SERIE 88 → Puerta Corrediza
INSERT INTO "series_categories" ("series_id", "category_id", "sort_order")
SELECT s.id, c.id, 1
FROM "window_series" s CROSS JOIN "window_categories" c
WHERE s.name = 'SERIE 88' AND c.name = 'PUERTA CORREDIZA'
ON CONFLICT ("series_id", "category_id") DO NOTHING;

-- SERIE DELUXE → Puerta Abatible
INSERT INTO "series_categories" ("series_id", "category_id", "sort_order")
SELECT s.id, c.id, 1
FROM "window_series" s CROSS JOIN "window_categories" c
WHERE s.name = 'SERIE DELUXE' AND c.name = 'PUERTA ABATIBLE'
ON CONFLICT ("series_id", "category_id") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 4: CLASIFICAR LOS 21 window_types EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── SERIE 80, VENTANA CORREDIZA (Marco 45 CM) ──────────────────────────────
-- ids: 1, 3, 4
UPDATE "window_types" SET
    "series_id"   = (SELECT id FROM "window_series"    WHERE name = 'SERIE 80'),
    "category_id" = (SELECT id FROM "window_categories" WHERE name = 'VENTANA CORREDIZA')
WHERE "name" IN (
    'VENTANA CORREDIZA 2 HOJAS 55 CM MARCO 45 CM',
    'VENTANA CORREDIZA 3 HOJAS 55 CM MARCO 45 CM',
    'VENTANA CORREDIZA 4 HOJAS 55 CM MARCO 45 CM'
);

-- ── SERIE 80, PUERTA CORREDIZA (Marco 45 CM) ───────────────────────────────
-- ids: 5, 8, 10
UPDATE "window_types" SET
    "series_id"   = (SELECT id FROM "window_series"    WHERE name = 'SERIE 80'),
    "category_id" = (SELECT id FROM "window_categories" WHERE name = 'PUERTA CORREDIZA')
WHERE "name" IN (
    'PUERTA CORREDIZA 2 HOJAS 66 CM MARCO 45 CM',
    'PUERTA CORREDIZA 3 HOJAS 66 CM MARCO 45 CM',
    'PUERTA CORREDIZA 4 HOJAS 66 CM MARCO 45 CM'
);

-- ── SERIE 60, VENTANA CORREDIZA (Marco 5 CM) ───────────────────────────────
-- ids: 18, 19, 21
UPDATE "window_types" SET
    "series_id"   = (SELECT id FROM "window_series"    WHERE name = 'SERIE 60'),
    "category_id" = (SELECT id FROM "window_categories" WHERE name = 'VENTANA CORREDIZA')
WHERE "name" IN (
    'VENTANA CORREDIZA 2 HOJAS 55 CM MARCO 5 CM',
    'VENTANA CORREDIZA 3 HOJAS 55 CM MARCO 5 CM',
    'VENTANA CORREDIZA 4 HOJAS 55 CM MARCO 5 CM'
);

-- ── SERIE 60, PUERTA CORREDIZA (Marco 5 CM) ────────────────────────────────
-- ids: 22, 25, 27
UPDATE "window_types" SET
    "series_id"   = (SELECT id FROM "window_series"    WHERE name = 'SERIE 60'),
    "category_id" = (SELECT id FROM "window_categories" WHERE name = 'PUERTA CORREDIZA')
WHERE "name" IN (
    'PUERTA CORREDIZA 2 HOJAS 66 CM MARCO 5 CM',
    'PUERTA CORREDIZA 3 HOJAS 66 CM MARCO 5 CM',
    'PUERTA CORREDIZA 4 HOJAS 66 CM MARCO 5 CM'
);

-- ── SERIE 88, PUERTA CORREDIZA ──────────────────────────────────────────────
-- ids: 29, 30, 31, 32
UPDATE "window_types" SET
    "series_id"   = (SELECT id FROM "window_series"    WHERE name = 'SERIE 88'),
    "category_id" = (SELECT id FROM "window_categories" WHERE name = 'PUERTA CORREDIZA')
WHERE "name" IN (
    'PUERTA CORREDIZA S88 2 HOJAS',
    'PUERTA CORREDIZA S88 3 HOJAS IGUALES',
    'PUERTA CORREDIZA S88 3 HOJAS LATERALES OCULTOS',
    'PUERTA CORREDIZA S88 3 HOJAS CORREDIZAS'
);

-- ── SERIE DELUXE, PUERTA ABATIBLE ──────────────────────────────────────────
-- ids: 12, 13
UPDATE "window_types" SET
    "series_id"   = (SELECT id FROM "window_series"    WHERE name = 'SERIE DELUXE'),
    "category_id" = (SELECT id FROM "window_categories" WHERE name = 'PUERTA ABATIBLE')
WHERE "name" IN (
    'PUERTA ANDINA',
    'PUERTA DE LUJO'
);

-- ── SIN SERIE (series_id = NULL) ────────────────────────────────────────────
-- ids: 11, 15, 17 — el admin los clasifica desde el panel
-- MARCO FIJO, VENTANA ABATIBLE, VENTANA PROYECTABLE
-- Ya son NULL por defecto — no se necesita UPDATE

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN: pegar en Neon SQL Editor para confirmar resultado
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT wt.id, wt.name, ws.name AS serie, wc.name AS categoria
-- FROM window_types wt
-- LEFT JOIN window_series ws     ON ws.id = wt.series_id
-- LEFT JOIN window_categories wc ON wc.id = wt.category_id
-- ORDER BY ws.sort_order NULLS LAST, wt.id;
