-- Ejecutar en Supabase SQL Editor (una vez) si ya tenías la tabla movements.
-- Añade auditoría de creador y ajusta políticas: admin solo edita lo propio y no puede eliminar (soft delete).

ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creator_email TEXT;

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
