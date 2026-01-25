# Tabla Cavani 2026 🏆

Aplicación web para llevar el ranking de juntadas entre amigos.

## 🎮 Estado Actual

**FUNCIONANDO CON LOCALSTORAGE** ✅

La app actualmente usa `localStorage` (almacenamiento local del navegador). Esto significa:
- ✅ Todos los botones funcionan
- ✅ Puedes agregar participantes y juntadas
- ✅ Puedes exportar a Excel
- ❌ Los datos solo se guardan en TU navegador
- ❌ No sirve para compartir con amigos (cada uno ve sus propios datos)

## 🚀 Para Habilitar Multi-Usuario con Supabase

Si quieres que todos tus amigos vean los mismos datos en tiempo real:

### Paso 1: Configurar Supabase (5 minutos)
Sigue la guía completa: **`supabase_setup_guide.md`**

### Paso 2: Descomentar Scripts
En `index.html`, busca las líneas 264-268 y descomenta:

**ANTES:**
```html
<!-- <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> -->
<!-- <script src="supabase-config.js"></script> -->
```

**DESPUÉS:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="supabase-config.js"></script>
```

### Paso 3: Usar Script de Supabase
Renombra los archivos:
```bash
mv script.js script-localstorage.js
mv script-supabase.js script.js   # (si existe)
```

O simplemente reemplaza `script.js` con el código de Supabase que está en el walkthrough.

## 📁 Archivos Importantes

- **`index.html`** - Página principal
- **`script.js`** - Lógica con localStorage (actual)
- **`styles.css`** - Estilos
- **`supabase-config.js`** - Configuración de Supabase (para cuando lo actives)
- **`supabase-schema.sql`** - Script SQL para crear las tablas
- **`supabase_setup_guide.md`** - Guía paso a paso

## 🔐 Login

**PIN:** `270701`

Solo el administrador (con PIN) puede:
- Agregar participantes
- Crear/editar/eliminar juntadas
- Exportar Excel

## 📊 Exportar Excel

Una vez logueado, el botón "📊 Exportar Excel" descarga un archivo con:
- Ranking actual
- Historial de todas las juntadas
- Estadísticas por participante

## 🌐 Subir a GitHub Pages (Opcional)

Para compartir la app con tus amigos:

1. Crea un repo en GitHub
2. Sube todos los archivos
3. Activa GitHub Pages en Settings
4. Comparte el link

**IMPORTANTE:** Con localStorage, cada persona verá solo sus propios datos. Para compartir datos, necesitas configurar Supabase primero.

## 🛠️ Soporte

Si tienes problemas:
1. Abre la consola del navegador (F12)
2. Revisa los errores
3. Verifica que el PIN sea correcto
4. Si configuraste Supabase, verifica las credenciales en `supabase-config.js`

---

**Versión:** 2026  
**Última actualización:** Enero 2026
