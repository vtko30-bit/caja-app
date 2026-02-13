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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

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
ALTER PUBLICATION supabase_realtime ADD TABLE public.movements;
