-- Ejecutar en Supabase: SQL Editor → New query → pegar y Run
-- Después de tener la tabla movements y de haber activado Auth.
-- Esto hace que SOLO usuarios que inicien sesión (email + contraseña) puedan leer/escribir.

-- Quitar permiso para anónimos
DROP POLICY IF EXISTS "Permitir todo para anon" ON public.movements;

-- Permitir solo a usuarios autenticados (quienes hayan iniciado sesión)
CREATE POLICY "Solo usuarios autenticados" ON public.movements
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
