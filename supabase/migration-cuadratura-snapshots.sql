-- Cuadraturas guardadas (payload JSON = misma estructura que en localStorage).
-- Ejecutar en Supabase SQL Editor después de schema.sql / auth-policies.sql.

CREATE TABLE IF NOT EXISTS public.cuadratura_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuadratura_snapshots_saved_at ON public.cuadratura_snapshots (saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_cuadratura_snapshots_created_by ON public.cuadratura_snapshots (created_by);

CREATE OR REPLACE FUNCTION public.cuadratura_snapshots_set_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by := auth.uid();
  SELECT email INTO NEW.creator_email FROM auth.users WHERE id = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_cuadratura_snapshots_set_creator ON public.cuadratura_snapshots;
CREATE TRIGGER tr_cuadratura_snapshots_set_creator
  BEFORE INSERT ON public.cuadratura_snapshots
  FOR EACH ROW
  EXECUTE PROCEDURE public.cuadratura_snapshots_set_creator();

ALTER TABLE public.cuadratura_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuadratura_snapshots_select_by_acl" ON public.cuadratura_snapshots;
CREATE POLICY "cuadratura_snapshots_select_by_acl" ON public.cuadratura_snapshots
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

DROP POLICY IF EXISTS "cuadratura_snapshots_insert_by_acl" ON public.cuadratura_snapshots;
CREATE POLICY "cuadratura_snapshots_insert_by_acl" ON public.cuadratura_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (auth.jwt()->'user_metadata'->>'role') IN ('super', 'full')
      OR EXISTS (
        SELECT 1
        FROM public.user_module_permissions p
        WHERE p.user_id = auth.uid()
          AND p.module = 'movements'
          AND p.can_write = true
      )
    )
  );

DROP POLICY IF EXISTS "cuadratura_snapshots_delete_super_only" ON public.cuadratura_snapshots;
CREATE POLICY "cuadratura_snapshots_delete_super_only" ON public.cuadratura_snapshots
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('super', 'full'));
