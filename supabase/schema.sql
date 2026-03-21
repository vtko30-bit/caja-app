-- Ejecutar en Supabase: SQL Editor → New query → pegar y Run
-- Crea la tabla de movimientos y habilita acceso y tiempo real

CREATE TABLE IF NOT EXISTS public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  local TEXT DEFAULT '',
  concept TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
  amount NUMERIC(12,2) NOT NULL,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Al insertar, registrar siempre el usuario autenticado y su email (auditoría).
CREATE OR REPLACE FUNCTION public.movements_set_creator()
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

DROP TRIGGER IF EXISTS tr_movements_set_creator ON public.movements;
CREATE TRIGGER tr_movements_set_creator
  BEFORE INSERT ON public.movements
  FOR EACH ROW
  EXECUTE PROCEDURE public.movements_set_creator();

-- Índices para filtros y listado
CREATE INDEX IF NOT EXISTS idx_movements_deleted_at ON public.movements (deleted_at);
CREATE INDEX IF NOT EXISTS idx_movements_date ON public.movements (date);

-- Políticas: permitir leer/escribir a todos (caja compartida multiusuario)
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo para anon" ON public.movements;
CREATE POLICY "Permitir todo para anon" ON public.movements
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Habilitar Realtime para la tabla (si da error "already exists", ignorar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE schemaname = 'public'
      AND tablename = 'movements'
      AND pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.movements;
  END IF;
END $$;

-- Tabla ACL: permisos por módulo y usuario
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module ON public.user_module_permissions (module);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Inicializar permisos por defecto (todos pueden leer, nadie puede escribir)
-- Importante: los usuarios 'super' igualmente tienen bypass por RLS en auth-policies.sql.
INSERT INTO public.user_module_permissions (user_id, module, can_read, can_write)
SELECT
  u.id,
  'movements',
  true AS can_read,
  false AS can_write
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_module_permissions p
  WHERE p.user_id = u.id
    AND p.module = 'movements'
);
