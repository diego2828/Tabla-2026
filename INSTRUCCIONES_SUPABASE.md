# Puesta a punto de Supabase

El proyecto es: https://supabase.com/dashboard/project/ijbzetgsoehpbunulmrc

---

## A. Cerrar la escritura al escribano (hacelo una sola vez)

Hasta ahora cualquiera que abriera la página podía escribir en las tablas:
la clave anónima viaja al navegador de todo el mundo (eso es normal y está
bien), pero las políticas de la base decían "dejá escribir a cualquiera".
El PIN solo escondía los botones.

Estos dos pasos lo cierran de verdad. **Hacelos en este orden**: si creás el
usuario pero no corrés el SQL, sigue abierto; si corrés el SQL pero no creás
el usuario, no vas a poder entrar.

### Paso 1 — Crear el usuario escribano

1. Panel de Supabase → **Authentication** → **Users**
2. Botón **Add user** → **Create new user**
3. Completá:
   - **Email**: `escribano@tablacavani.app`
     (tiene que ser exactamente este: es el que busca `script.js`)
   - **Password**: tu clave nueva de 6 dígitos
   - **Auto Confirm User**: ✅ **tildado** (si no, Supabase espera que
     confirmes un mail que nunca va a llegar a esa dirección)
4. **Create user**

> La clave queda guardada solo acá, cifrada. No está en el código, ni en
> GitHub, ni la sabe nadie más. Si la perdés: Authentication → Users → los
> tres puntos del usuario → **Reset password**.
>
> Elegí una clave nueva. La anterior quedó en el historial público de
> GitHub y hay que darla por quemada.

### Paso 2 — Correr las políticas nuevas

1. Panel de Supabase → **SQL Editor** → **New query**
2. Pegá todo el contenido de **`supabase-seguridad.sql`**
3. **Run**
4. Al final te va a listar 12 políticas. Mirá la columna `roles`:
   - las 3 de `SELECT` deben decir `{public}` (todos pueden mirar la tabla)
   - las 9 de `INSERT` / `UPDATE` / `DELETE` deben decir `{authenticated}`

Si alguna de escritura todavía dice `{public}`, quedó una política vieja con
otro nombre: borrala desde Authentication → Policies y volvé a correr el SQL.

### Paso 3 — Comprobar que quedó cerrado de verdad

Pegá esto en la Terminal. Intenta escribir sin sesión, con un dato inválido
a propósito, así **no crea nada pase lo que pase**:

```bash
curl -s -X POST "https://ijbzetgsoehpbunulmrc.supabase.co/rest/v1/participants" \
  -H "apikey: $(grep -o 'eyJ[A-Za-z0-9._-]*' supabase-config.js | head -1)" \
  -H "Authorization: Bearer $(grep -o 'eyJ[A-Za-z0-9._-]*' supabase-config.js | head -1)" \
  -H "Content-Type: application/json" -d '{"starting_points":0}'
```

| Respuesta | Significa |
|---|---|
| `"code":"42501"` · *violates row-level security policy* | ✅ **Cerrado.** Sin sesión no se puede escribir |
| `"code":"23502"` · *null value in column "name"* | ❌ **Abierto todavía.** El SQL no corrió, o quedaron políticas viejas |

Antes de aplicar el arreglo esto daba `23502`. Tiene que dar `42501`.

### Paso 4 — Probar la aplicación

1. Abrí `index.html`
2. La tabla y las juntadas tienen que verse **sin entrar** (la lectura es
   pública, para que el grupo mire el ranking)
3. **Entrar** → poné cualquier número de 6 dígitos equivocado → "Clave incorrecta"
4. **Entrar** → tu clave real → se habilitan Participante, Exportar y Nueva juntada
5. Cargá algo y verificá en Table Editor que se guardó
6. **Salir** → los botones se bloquean otra vez

---

## B. Si alguna vez tenés que recrear las tablas desde cero

1. SQL Editor → pegá `supabase-schema.sql` → Run
2. Después **sí o sí** corré también `supabase-seguridad.sql`, porque el
   esquema original crea las políticas abiertas

---

## Si algo falla

Abrí la consola del navegador (F12 → Console).

| Lo que ves | Qué pasa |
|---|---|
| `Supabase inicializado correctamente` | La conexión está bien |
| "Clave incorrecta" con la clave buena | El usuario no existe, el email no es exactamente `escribano@tablacavani.app`, o quedó sin **Auto Confirm** |
| Guardar falla con error de *row-level security* | Entraste bien pero la sesión venció: salí y volvé a entrar |
| La tabla se ve vacía sin entrar | Faltan las políticas de lectura: corré `supabase-seguridad.sql` |

## Varias tablas y la tabla global

La web ya sabe mostrar varias tablas (una por temporada) y una global que las
suma, pero la base tiene que tener las tablas nuevas. Hasta que se corra el
SQL, la web sigue mostrando la Tabla 2026 como siempre.

1. Supabase → SQL Editor → New query.
2. Pegá todo `supabase-temporadas.sql` y dale Run. No borra nada y se puede
   correr más de una vez.
3. La verificación del final tiene que mostrar «Tabla 2026» con todas las
   juntadas y los participantes, y `juntadas_sin_tabla = 0`.

Después, entrando como escribano, aparecen «Nueva tabla» y «Editar tabla»
arriba, al lado de las pestañas. Para cargar un año viejo sin el detalle de
cada juntada: creá la tabla y cargá a cada uno con «Participante» poniendo su
puntaje final como puntos iniciales.

Orden importante: subí primero esta versión de la web y después corré el
SQL. El SQL hace obligatoria la tabla de cada juntada, y la versión vieja de
la web no la manda.

## Fotos de los participantes

1. Supabase → SQL Editor → New query → pegá todo `supabase-fotos.sql` → Run.
   Agrega la columna `photo_url` y crea la carpeta pública `fotos` en Storage
   (mirar es público; subir, cambiar y borrar exige la sesión del escribano).
2. Entrando como escribano, tocá a alguien en la tabla: en su panel aparecen
   «Cambiar foto» y «Quitar foto». La web recorta la foto al cuadrado y la
   achica a 320px antes de subirla.

Hasta que se corra el SQL, cada uno se ve con su inicial en su color.
