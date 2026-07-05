# Cómo poner la app en modo Online (Supabase)

Sigue estos pasos en orden. Cuando termines, la app mostrará "Online" y tendrás registro de eliminados y sincronización entre dispositivos.

---

## Paso 1: Crear cuenta y proyecto en Supabase

1. Entra en **https://supabase.com** y haz clic en **Start your project**.
2. Inicia sesión con GitHub (o el método que prefieras).
3. Clic en **New Project**.
4. Rellena:
   - **Name:** por ejemplo `caja-app`.
   - **Database Password:** inventa una contraseña segura y **guárdala** (la pide para conectar a la base de datos).
   - **Region:** elige la más cercana (ej. South America si estás en Latinoamérica).
5. Clic en **Create new project** y espera 1–2 minutos a que se cree.

---

## Paso 2: Crear la tabla en la base de datos

1. En el menú izquierdo de Supabase, entra en **SQL Editor**.
2. Clic en **New query**.
3. Abre en tu PC el archivo **supabase/schema.sql** (está en la carpeta de la app).
4. Copia **todo** el contenido del archivo y pégalo en el editor SQL de Supabase.
5. Clic en **Run** (o Ctrl+Enter).
6. Debe decir **Success** en verde. Si sale un error de "already exists" en la última línea, puedes ignorarlo.

---

## Paso 3: Copiar la URL y la clave (API keys)

1. En el menú izquierdo de Supabase, entra en **Settings** (icono de engranaje).
2. Clic en **API** en el submenú.
3. En **Project URL** haz clic en el icono de copiar y pega ese valor en un bloc de notas.  
   Ejemplo: `https://abcdefghijk.supabase.co`
4. Más abajo, en **Project API keys**, busca **anon** **public**.  
   Haz clic en copiar junto a esa clave (es larga, empieza por `eyJ...`).  
   Pégala también en el bloc de notas.

---

## Paso 4: Poner la URL y la clave en tu proyecto

1. En tu PC, abre la carpeta de la app:  
   `C:\Users\Lenovo\Proyectos\caja-app`
2. Abre el archivo **config.js** con el Bloc de notas o con Cursor.
3. Sustituye las dos líneas para que queden así (con **tus** datos de Supabase):

   ```javascript
   window.CAJA_SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
   window.CAJA_SUPABASE_ANON_KEY = "eyJ...tu_clave_anon_completa...";
   ```

   - Donde pone `https://TU_PROYECTO.supabase.co` pega tu **Project URL**.
   - Donde pone `eyJ...` pega tu **anon public key** completa.
4. Guarda el archivo (Ctrl+S).

---

## Paso 5: Subir los cambios a Vercel

1. Abre PowerShell (o terminal) y ejecuta:

   ```bash
   cd C:\Users\Lenovo\Proyectos\caja-app
   git add config.js
   git commit -m "Configurar Supabase para modo online"
   git push origin main
   ```

2. Espera 1–2 minutos a que Vercel vuelva a desplegar la app.

---

## Paso 6: Probar

1. Abre la URL de tu app en Vercel (ej. `https://caja-app-xxx.vercel.app`).
2. Haz un refresco fuerte: **Ctrl + Shift + R**.
3. Arriba a la izquierda debería decir **Online** en lugar de Local.
4. Prueba a guardar un movimiento: debe guardarse en Supabase y verse en cualquier dispositivo que abra la misma URL.
5. El botón **Ver eliminados** debe estar visible; al borrar un movimiento, aparecerá ahí.

---

## Paso 7 (opcional): Proteger con usuario y contraseña

Si quieres que solo quien tenga una cuenta pueda entrar:

1. En Supabase, menú izquierdo → **Authentication** → **Providers**. Asegúrate de que **Email** esté activado (por defecto suele estarlo).
2. En **SQL Editor** → **New query**, abre el archivo **supabase/auth-policies.sql** de la app, copia todo, pégalo y haz **Run**.
3. Sube los últimos cambios a GitHub (si acabas de añadir login en la app):
   ```bash
   cd C:\Users\Lenovo\Proyectos\caja-app
   git add .
   git commit -m "Proteger app con login (usuario y contraseña)"
   git push origin main
   ```
4. Al abrir la app en Vercel verás la pantalla de **Iniciar sesión**. Clic en **Crear cuenta**, pon tu correo y una contraseña, y listo. A partir de ahí solo tú (y quien tenga una cuenta) podréis entrar.

---

## Paso 8 (opcional): Iniciar sesión con Google (Gmail)

Para que aparezca el botón **Continuar con Google** en la pantalla de login:

### 8.1 Google Cloud Console

1. Entra en **https://console.cloud.google.com** y crea un proyecto (o usa uno existente).
2. Menú **APIs y servicios** → **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**.
3. Tipo de aplicación: **Aplicación web**.
4. En **Orígenes autorizados de JavaScript** añade:
   - `https://caja-app.vercel.app`
   - `http://localhost:5500` (si pruebas en local)
5. En **URIs de redirección autorizados** añade **exactamente** esta URL (callback de Supabase):
   - `https://lpmpczarkjvnwjhwghqg.supabase.co/auth/v1/callback`
6. Copia el **Client ID** y el **Client Secret**.

### 8.2 Supabase

1. Abre tu proyecto en Supabase:  
   **https://supabase.com/dashboard/project/lpmpczarkjvnwjhwghqg/auth/providers**
2. Haz clic en **Google**.
3. Activa el interruptor **Enable Sign in with Google**.
4. Pega el **Client ID** y el **Client Secret** de Google Cloud (paso 8.1).
5. Clic en **Save**.

   La URL de callback que debes usar en Google Cloud es exactamente:  
   `https://lpmpczarkjvnwjhwghqg.supabase.co/auth/v1/callback`

6. En **Authentication** → **URL Configuration** (`/auth/url-configuration`):
   - **Site URL:** `https://caja-app.vercel.app`
   - **Redirect URLs:** añade `https://caja-app.vercel.app` (y `http://localhost:5500` si pruebas en local)

### Error «Unsupported provider: provider is not enabled»

Significa que el paso 8.2 **no está hecho** o no guardaste tras activar Google. Vuelve a Supabase → Providers → Google, confirma que el toggle está **ON** y que Client ID + Secret están completos → **Save**.

### 8.3 Desplegar

Sube los cambios de la app a GitHub/Vercel (`git push origin main`). Tras el deploy, el botón **Continuar con Google** redirigirá a Gmail y volverá a la app con la sesión iniciada.

**Nota:** Las cuentas nuevas por Google no tienen rol asignado automáticamente. Un usuario **super** debe darles permisos desde el panel de administración (rol y acceso al módulo de movimientos).

---

## Si el enlace de confirmación te abre otra web (otro proyecto en Vercel)

La cuenta **sí queda confirmada** al hacer clic en el enlace (aunque te lleve a otro sitio). Para entrar: abre **la URL de tu app Caja** en Vercel y usa **Entrar** con tu correo y contraseña.

Para que la próxima vez el enlace de confirmación lleve a la app Caja:

1. En Supabase, menú **Authentication** → **URL Configuration**.
2. En **Site URL** pon la URL de tu app Caja, por ejemplo: `https://tu-caja-app.vercel.app` (la que te da Vercel para este proyecto).
3. En **Redirect URLs** añade la misma URL si no está, por ejemplo: `https://tu-caja-app.vercel.app`
4. Guarda. Los próximos correos de confirmación redirigirán a tu app Caja.

---

## Importante

- La **anon key** es pública (va en el código del navegador). Eso es normal; la seguridad se controla en Supabase con las políticas (RLS).
- Si tu repositorio en GitHub es **público**, cualquiera podría ver tu `config.js` y la anon key. Si no quieres eso, puedes usar variables de entorno en Vercel y generar `config.js` en el build; si quieres, en otro momento te explico cómo.

Cuando termines los 6 pasos, la app quedará en modo Online. Con el Paso 7 quedará además protegida con usuario y contraseña.
