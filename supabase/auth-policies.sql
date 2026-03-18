-- Ejecutar en Supabase: SQL Editor → New query → pegar y Run
--
-- ACL por módulo (user_module_permissions)
-- Módulo actual soportado: 'movements'

ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas (movements)
DROP POLICY IF EXISTS "Permitir todo para anon" ON public.movements;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.movements;

DROP POLICY IF EXISTS "movements_select_super" ON public.movements;
DROP POLICY IF EXISTS "movements_select_active_for_admin_user" ON public.movements;
DROP POLICY IF EXISTS "movements_insert_admin_super" ON public.movements;
DROP POLICY IF EXISTS "movements_update_super" ON public.movements;
DROP POLICY IF EXISTS "movements_update_admin_active" ON public.movements;
DROP POLICY IF EXISTS "movements_delete_super" ON public.movements;

-- Limpieza de políticas previas (user_module_permissions)
DROP POLICY IF EXISTS "user_module_permissions_select_own_or_super" ON public.user_module_permissions;
DROP POLICY IF EXISTS "user_module_permissions_write_only_super" ON public.user_module_permissions;

-- ========= user_module_permissions (ACL) =========

-- SELECT: el usuario ve sus filas y super ve todo
CREATE POLICY "user_module_permissions_select_own_or_super" ON public.user_module_permissions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('super', 'full')
    OR user_id = auth.uid()
  );

-- INSERT: solo super
CREATE POLICY "user_module_permissions_write_only_super" ON public.user_module_permissions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));

-- UPDATE: solo super
CREATE POLICY "user_module_permissions_write_only_super_update" ON public.user_module_permissions
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'))
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));

-- DELETE: solo super
CREATE POLICY "user_module_permissions_write_only_super_delete" ON public.user_module_permissions
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));

-- ========= movements =========

-- SELECT: super o permission can_read=true (para el módulo 'movements')
CREATE POLICY "movements_select_by_acl" ON public.movements
  FOR SELECT TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('super', 'full')
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions p
      WHERE p.user_id = auth.uid()
        AND p.module = 'movements'
        AND p.can_read = true
    )
  );

-- INSERT: super o permission can_write=true
CREATE POLICY "movements_insert_by_acl" ON public.movements
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') IN ('super', 'full')
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions p
      WHERE p.user_id = auth.uid()
        AND p.module = 'movements'
        AND p.can_write = true
    )
  );

-- UPDATE: super o permission can_write=true
CREATE POLICY "movements_update_by_acl" ON public.movements
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('super', 'full')
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions p
      WHERE p.user_id = auth.uid()
        AND p.module = 'movements'
        AND p.can_write = true
    )
  )
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') IN ('super', 'full')
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions p
      WHERE p.user_id = auth.uid()
        AND p.module = 'movements'
        AND p.can_write = true
    )
  );

-- DELETE: no lo usamos (soft delete), pero lo dejamos bloqueado salvo super
CREATE POLICY "movements_delete_super_only" ON public.movements
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));
