-- ===================================================================
-- TABLA CAVANI - Varias tablas (temporadas) y la tabla global
-- ===================================================================
--
-- QUÉ HACE
--   - Crea "seasons": cada tabla tiene nombre y fechas de inicio y cierre.
--   - Crea la "Tabla 2026" y le asigna TODAS las juntadas que ya existen.
--   - Agrega events.season_id: cada juntada pertenece a una tabla.
--   - Crea "season_participants": quién juega cada tabla y con cuántos
--     puntos iniciales arranca. Los 8 de hoy entran a la Tabla 2026 con los
--     puntos iniciales que ya tenían.
--   - Las personas (participants) son las mismas en todas las tablas: así
--     la tabla global puede sumarle a cada uno lo de todos los años.
--
-- QUÉ NO HACE
--   - No borra ninguna tabla, columna, juntada ni puntaje.
--   - participants.starting_points queda donde está (la web deja de usarla
--     y lee los puntos iniciales de season_participants).
--
-- SEGURIDAD
--   Igual que supabase-seguridad.sql: leer es público, escribir exige la
--   sesión del escribano.
--
-- CÓMO CORRERLO
--   Panel de Supabase -> SQL Editor -> New query -> pegar todo -> Run.
--   Es idempotente: se puede correr más de una vez sin duplicar nada.
-- ===================================================================

BEGIN;

-- 1. Las tablas
CREATE TABLE IF NOT EXISTS seasons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    close_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (close_date >= start_date)
);

-- 2. La Tabla 2026, la que existe hoy
INSERT INTO seasons (name, start_date, close_date)
VALUES ('Tabla 2026', '2026-01-01', '2026-12-21')
ON CONFLICT (name) DO NOTHING;

-- 3. Cada juntada pertenece a una tabla. ON DELETE RESTRICT: no se puede
--    borrar una tabla que todavía tiene juntadas.
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id) ON DELETE RESTRICT;

UPDATE events
SET season_id = (SELECT id FROM seasons WHERE name = 'Tabla 2026')
WHERE season_id IS NULL;

ALTER TABLE events ALTER COLUMN season_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_season_id ON events(season_id);

-- 4. Quién juega cada tabla, con sus puntos iniciales
CREATE TABLE IF NOT EXISTS season_participants (
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    starting_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (season_id, participant_id)
);

INSERT INTO season_participants (season_id, participant_id, starting_points)
SELECT s.id, p.id, COALESCE(p.starting_points, 0)
FROM participants p
CROSS JOIN seasons s
WHERE s.name = 'Tabla 2026'
ON CONFLICT (season_id, participant_id) DO NOTHING;

-- 5. Seguridad: lectura pública, escritura solo con sesión
ALTER TABLE seasons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de tablas"      ON seasons;
DROP POLICY IF EXISTS "Escribano inserta tablas"       ON seasons;
DROP POLICY IF EXISTS "Escribano actualiza tablas"     ON seasons;
DROP POLICY IF EXISTS "Escribano borra tablas"         ON seasons;
DROP POLICY IF EXISTS "Lectura pública de planteles"   ON season_participants;
DROP POLICY IF EXISTS "Escribano inserta planteles"    ON season_participants;
DROP POLICY IF EXISTS "Escribano actualiza planteles"  ON season_participants;
DROP POLICY IF EXISTS "Escribano borra planteles"      ON season_participants;

CREATE POLICY "Lectura pública de tablas"
    ON seasons FOR SELECT USING (true);
CREATE POLICY "Escribano inserta tablas"
    ON seasons FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Escribano actualiza tablas"
    ON seasons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escribano borra tablas"
    ON seasons FOR DELETE TO authenticated USING (true);

CREATE POLICY "Lectura pública de planteles"
    ON season_participants FOR SELECT USING (true);
CREATE POLICY "Escribano inserta planteles"
    ON season_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Escribano actualiza planteles"
    ON season_participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escribano borra planteles"
    ON season_participants FOR DELETE TO authenticated USING (true);

COMMIT;

-- ===================================================================
-- Verificación: una fila "Tabla 2026" con 40 juntadas y 8 participantes
-- (o los números que tengas), y ninguna juntada sin tabla.
-- ===================================================================

SELECT s.name,
       (SELECT COUNT(*) FROM events e WHERE e.season_id = s.id)               AS juntadas,
       (SELECT COUNT(*) FROM season_participants sp WHERE sp.season_id = s.id) AS participantes
FROM seasons s
ORDER BY s.start_date DESC;

SELECT COUNT(*) AS juntadas_sin_tabla FROM events WHERE season_id IS NULL;
