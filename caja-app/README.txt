App de caja - Local y online multiusuario
=========================================

La app funciona en dos modos:
- LOCAL: sin configurar Supabase, los datos se guardan solo en el navegador (localStorage).
- ONLINE MULTIUSUARIO: con Supabase configurado, todos los que usen la misma app ven y editan los mismos movimientos en tiempo real. Los eliminados quedan en un registro aparte y se pueden restaurar.

Compatibilidad: Windows y Android (navegador o instalada como PWA).


Configuración ONLINE (Supabase)
-------------------------------

1. Crea una cuenta en https://supabase.com y un proyecto nuevo.

2. En el proyecto: SQL Editor → New query. Abre el archivo:
     supabase/schema.sql
   Copia todo su contenido, pégalo en el editor y ejecuta (Run). Eso crea la tabla "movements" y habilita el acceso y el tiempo real.

3. En el proyecto: Settings → API. Copia:
     - Project URL
     - anon public key

4. En la carpeta de la app, edita config.js (o copia config.example.js a config.js y edítalo):
     window.CAJA_SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
     window.CAJA_SUPABASE_ANON_KEY = "tu_anon_key_aqui";

5. Sirve la app por HTTP/HTTPS (por ejemplo con "python -m http.server 8000" o subiéndola a un hosting). Abre la URL en el navegador. Deberías ver el badge "Online" y los cambios se sincronizan entre todos los que tengan la misma URL.

Registro de movimientos eliminados (solo modo online)
-----------------------------------------------------

Con Supabase configurado, al borrar un movimiento no se pierde: se marca como eliminado y pasa al "Registro de movimientos eliminados". Puedes abrirlo con el botón "Ver eliminados", ver la lista (con fecha/hora de eliminación) y usar "Restaurar" en cualquier fila para volverla a la caja activa.


Uso en Android y Windows
------------------------

- Windows: abre la app en Chrome o Edge. Puedes instalarla como aplicación (menú → "Instalar Caja" o "Aplicación disponible").
- Android: abre la URL en Chrome. En menú → "Añadir a la pantalla de inicio" o "Instalar app" para usarla como PWA. Funciona en modo online y offline (sin conexión se muestra un aviso y, si estaba en modo local, sigue usando datos locales).

Sin conexión (modo online): se muestra la banda "Sin conexión. Los cambios se guardarán al reconectar." y se usa la última copia en caché; al volver a tener conexión se actualiza todo.


Archivos principales
--------------------

- index.html     Interfaz (formulario, tabla, filtros, panel de eliminados).
- app.js         Lógica (local + Supabase, soft delete, realtime).
- config.js      URL y clave de Supabase (vacío = solo local).
- styles.css     Estilos.
- service-worker.js  Caché para uso offline.
- manifest.json  PWA.
- supabase/schema.sql  Script para crear la tabla en Supabase.
