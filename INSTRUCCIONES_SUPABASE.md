# 🚀 PASOS PARA ACTIVAR SUPABASE

## ⚠️ IMPORTANTE - Debes hacer esto AHORA:

### 1. Ir a Supabase SQL Editor

1. Ve a: https://supabase.com/dashboard/project/ijbzetgsoehpbunulmrc/sql/new
2. Copia TODO el contenido del archivo `supabase-schema.sql`
3. Pégalo en el editor SQL
4. Click en "RUN" (botón verde abajo a la derecha)
5. Deberías ver: "Success. No rows returned"

### 2. Verificar que se crearon las tablas

1. Ve a: Table Editor (menú izquierdo)
2. Deberías ver 3 tablas:
   - participants
   - events  
   - event_scores

### 3. Probar la aplicación

1. Abre index.html en tu navegador
2. Presiona F12 y ve a Console
3. Deberías ver: "✅ Supabase inicializado correctamente"
4. Haz login con PIN 270701
5. Agrega un participante
6. Ve a Supabase Table Editor → participants
7. Deberías ver el participante que agregaste

## ✅ Si todo funciona:

¡Listo! Ya puedes:
- Subir la app a GitHub Pages
- Compartir el link con tus amigos
- Todos verán los mismos datos en tiempo real

## ❌ Si algo falla:

Avísame qué error ves en la consola
