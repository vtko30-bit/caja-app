-- Ejecutar en Supabase: SQL Editor → New query → pegar y Run
-- RBAC por user_metadata.role para la tabla public.movements
--
-- Roles esperados:
--  - super: puede leer/escribir todo (incluye borrado y eliminados)
--  - admin: puede leer/escribir movimientos activos (deleted_at IS NULL), pero NO borrar/restaurar
--  - user: solo lectura de movimientos activos

ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas (si existieran)
DROP POLICY IF EXISTS "Permitir todo para anon" ON public.movements;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.movements;

DROP POLICY IF EXISTS "movements_select_super" ON public.movements;
DROP POLICY IF EXISTS "movements_select_active_for_admin_user" ON public.movements;
DROP POLICY IF EXISTS "movements_insert_admin_super" ON public.movements;
DROP POLICY IF EXISTS "movements_update_super" ON public.movements;
DROP POLICY IF EXISTS "movements_update_admin_active" ON public.movements;
DROP POLICY IF EXISTS "movements_delete_super" ON public.movements;

-- SELECT
CREATE POLICY "movements_select_super" ON public.movements
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));

CREATE POLICY "movements_select_active_for_admin_user" ON public.movements
  FOR SELECT TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('admin', 'user', 'viewer')
    AND deleted_at IS NULL
  );

-- INSERT
CREATE POLICY "movements_insert_admin_super" ON public.movements
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') IN ('super', 'admin', 'full')
  );

-- UPDATE
-- Super: puede actualizar filas activas y también las eliminadas (restaurar)
CREATE POLICY "movements_update_super" ON public.movements
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'))
  WITH CHECK (true);

-- Admin: solo puede actualizar filas activas y sin cambiar deleted_at (deleted_at debe seguir siendo NULL)
CREATE POLICY "movements_update_admin_active" ON public.movements
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') = 'admin'
    AND deleted_at IS NULL
  )
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') = 'admin'
    AND deleted_at IS NULL
  );

-- DELETE (protegido, aunque el frontend usa UPDATE soft delete)
CREATE POLICY "movements_delete_super" ON public.movements
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));
