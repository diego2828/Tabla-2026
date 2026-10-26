-- ===================================================================
-- TABLA CAVANI 2026 - Cerrar la escritura al escribano
-- ===================================================================
--
-- QUÉ ARREGLA
-- Las políticas originales eran USING (true) para insertar, actualizar y
-- borrar. Eso significa que cualquiera con la clave anónima (que viaja al
-- navegador de todo el que abre la página, y eso es normal) podía escribir
-- en las tablas sin pasar por ningún PIN. El PIN del navegador solo
-- escondía los botones.
--
-- Después de correr esto:
--   - Leer la tabla sigue siendo público: todos ven el ranking.
--   - Insertar, actualizar y borrar exige una sesión iniciada en Supabase.
--   - La clave del escribano vive solo en Supabase, nunca en el código.
--
-- CÓMO CORRERLO
--   1. Panel de Supabase -> SQL Editor -> New query
--   2. Pegá todo este archivo y dale Run
--   3. Después creá el usuario escribano (ver INSTRUCCIONES_SUPABASE.md)
--
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ===================================================================

-- 1. Asegurar que RLS esté activo (si ya lo estaba, no hace nada)
ALTER TABLE participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_scores  ENABLE ROW LEVEL SECURITY;

-- 2. Borrar las políticas abiertas de escritura
DROP POLICY IF EXISTS "Permitir inserción de participantes"   ON participants;
DROP POLICY IF EXISTS "Permitir actualización de participantes" ON participants;
DROP POLICY IF EXISTS "Permitir eliminación de participantes" ON participants;

DROP POLICY IF EXISTS "Permitir inserción de eventos"         ON events;
DROP POLICY IF EXISTS "Permitir actualización de eventos"     ON events;
DROP POLICY IF EXISTS "Permitir eliminación de eventos"       ON events;

DROP POLICY IF EXISTS "Permitir inserción de puntajes"        ON event_scores;
DROP POLICY IF EXISTS "Permitir actualización de puntajes"    ON event_scores;
DROP POLICY IF EXISTS "Permitir eliminación de puntajes"      ON event_scores;

-- Y las nuevas, por si este archivo se corre dos veces
DROP POLICY IF EXISTS "Escribano inserta participantes"   ON participants;
DROP POLICY IF EXISTS "Escribano actualiza participantes" ON participants;
DROP POLICY IF EXISTS "Escribano borra participantes"     ON participants;
DROP POLICY IF EXISTS "Escribano inserta juntadas"        ON events;
DROP POLICY IF EXISTS "Escribano actualiza juntadas"      ON events;
DROP POLICY IF EXISTS "Escribano borra juntadas"          ON events;
DROP POLICY IF EXISTS "Escribano inserta puntajes"        ON event_scores;
DROP POLICY IF EXISTS "Escribano actualiza puntajes"      ON event_scores;
DROP POLICY IF EXISTS "Escribano borra puntajes"          ON event_scores;

-- 3. La lectura sigue siendo pública: el grupo entra y mira la tabla.
--    (Se recrean por si no existían; si ya estaban, el DROP las limpia antes.)
DROP POLICY IF EXISTS "Permitir lectura pública de participantes" ON participants;
DROP POLICY IF EXISTS "Permitir lectura pública de eventos"       ON events;
DROP POLICY IF EXISTS "Permitir lectura pública de puntajes"      ON event_scores;

CREATE POLICY "Lectura pública de participantes"
    ON participants FOR SELECT USING (true);
CREATE POLICY "Lectura pública de juntadas"
    ON events FOR SELECT USING (true);
CREATE POLICY "Lectura pública de puntajes"
    ON event_scores FOR SELECT USING (true);

-- 4. Escribir exige sesión iniciada.
--    auth.role() vale 'anon' sin sesión y 'authenticated' con sesión.
--    Nadie puede falsificarlo desde el navegador: lo decide el servidor
--    de Supabase al validar el token.

-- Participantes
CREATE POLICY "Escribano inserta participantes"
    ON participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Escribano actualiza participantes"
    ON participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escribano borra participantes"
    ON participants FOR DELETE TO authenticated USING (true);

-- Juntadas
CREATE POLICY "Escribano inserta juntadas"
    ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Escribano actualiza juntadas"
    ON events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escribano borra juntadas"
    ON events FOR DELETE TO authenticated USING (true);

-- Puntajes
CREATE POLICY "Escribano inserta puntajes"
    ON event_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Escribano actualiza puntajes"
    ON event_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escribano borra puntajes"
    ON event_scores FOR DELETE TO authenticated USING (true);

-- ===================================================================
-- Verificación
-- ===================================================================
-- Debe listar 12 políticas: 3 de lectura (roles = {public}) y 9 de
-- escritura (roles = {authenticated}). Si alguna de escritura todavía
-- dice {public}, quedó una política vieja sin borrar.

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('participants', 'events', 'event_scores')
ORDER BY tablename, cmd, policyname;
