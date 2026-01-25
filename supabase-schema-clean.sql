-- ===================================
-- LIMPIAR Y RECREAR TODO
-- ===================================

-- 1. Eliminar políticas existentes (si existen)
DROP POLICY IF EXISTS "Permitir lectura pública de participantes" ON participants;
DROP POLICY IF EXISTS "Permitir inserción de participantes" ON participants;
DROP POLICY IF EXISTS "Permitir actualización de participantes" ON participants;
DROP POLICY IF EXISTS "Permitir eliminación de participantes" ON participants;

DROP POLICY IF EXISTS "Permitir lectura pública de eventos" ON events;
DROP POLICY IF EXISTS "Permitir inserción de eventos" ON events;
DROP POLICY IF EXISTS "Permitir actualización de eventos" ON events;
DROP POLICY IF EXISTS "Permitir eliminación de eventos" ON events;

DROP POLICY IF EXISTS "Permitir lectura pública de puntajes" ON event_scores;
DROP POLICY IF EXISTS "Permitir inserción de puntajes" ON event_scores;
DROP POLICY IF EXISTS "Permitir actualización de puntajes" ON event_scores;
DROP POLICY IF EXISTS "Permitir eliminación de puntajes" ON event_scores;

-- 2. Eliminar tablas existentes (esto eliminará los datos!)
DROP TABLE IF EXISTS event_scores CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS participants CASCADE;

-- 3. Crear tabla de participantes
CREATE TABLE participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    starting_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Crear tabla de eventos
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    total_points_disputed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Crear tabla de puntajes de eventos
CREATE TABLE event_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= -3 AND score <= 3),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, participant_id)
);

-- 6. Crear índices
CREATE INDEX idx_event_scores_event_id ON event_scores(event_id);
CREATE INDEX idx_event_scores_participant_id ON event_scores(participant_id);
CREATE INDEX idx_events_date ON events(date DESC);

-- 7. Habilitar RLS
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_scores ENABLE ROW LEVEL SECURITY;

-- 8. Crear políticas (permitir todo para simplificar)

-- Participantes
CREATE POLICY "Permitir lectura pública de participantes"
    ON participants FOR SELECT
    USING (true);

CREATE POLICY "Permitir inserción de participantes"
    ON participants FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Permitir actualización de participantes"
    ON participants FOR UPDATE
    USING (true);

CREATE POLICY "Permitir eliminación de participantes"
    ON participants FOR DELETE
    USING (true);

-- Eventos
CREATE POLICY "Permitir lectura pública de eventos"
    ON events FOR SELECT
    USING (true);

CREATE POLICY "Permitir inserción de eventos"
    ON events FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Permitir actualización de eventos"
    ON events FOR UPDATE
    USING (true);

CREATE POLICY "Permitir eliminación de eventos"
    ON events FOR DELETE
    USING (true);

-- Event Scores
CREATE POLICY "Permitir lectura pública de puntajes"
    ON event_scores FOR SELECT
    USING (true);

CREATE POLICY "Permitir inserción de puntajes"
    ON event_scores FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Permitir actualización de puntajes"
    ON event_scores FOR UPDATE
    USING (true);

CREATE POLICY "Permitir eliminación de puntajes"
    ON event_scores FOR DELETE
    USING (true);

-- 9. Verificar
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('participants', 'events', 'event_scores');
