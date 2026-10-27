-- ===================================================================
-- TABLA CAVANI - Una foto por participante
-- ===================================================================
--
-- QUÉ HACE
--   - Agrega participants.photo_url: la dirección pública de su foto.
--   - Crea la carpeta "fotos" en Supabase Storage, pública para mirar.
--   - Solo el escribano (sesión iniciada) puede subir, cambiar o borrar.
--
-- No borra nada. Es idempotente: se puede correr más de una vez.
--
-- CÓMO CORRERLO
--   Panel de Supabase -> SQL Editor -> New query -> pegar todo -> Run.
-- ===================================================================

-- 1. La columna
ALTER TABLE participants ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. La carpeta. Pública = cualquiera ve las fotos con su dirección.
--    Hasta 2 MB por archivo y solo imágenes (la web las sube de ~30 KB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos', 'fotos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Quién escribe en la carpeta: solo con sesión
DROP POLICY IF EXISTS "Escribano sube fotos"    ON storage.objects;
DROP POLICY IF EXISTS "Escribano cambia fotos"  ON storage.objects;
DROP POLICY IF EXISTS "Escribano borra fotos"   ON storage.objects;
DROP POLICY IF EXISTS "Escribano lee fotos"     ON storage.objects;

-- Reemplazar una foto (upsert) necesita poder leer la anterior por la API.
-- Mirarlas no: la carpeta es pública y se sirven por su dirección.
CREATE POLICY "Escribano lee fotos"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'fotos');

CREATE POLICY "Escribano sube fotos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'fotos');
CREATE POLICY "Escribano cambia fotos"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'fotos') WITH CHECK (bucket_id = 'fotos');
CREATE POLICY "Escribano borra fotos"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'fotos');

-- Verificación: una fila 'fotos' con public = true
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'fotos';
