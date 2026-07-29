-- Tabela de planos
CREATE TABLE IF NOT EXISTS public.planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planos_professional ON public.planos(professional_id);

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read planos" ON public.planos;
CREATE POLICY "public read planos" ON public.planos
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "owner manage planos" ON public.planos;
CREATE POLICY "owner manage planos" ON public.planos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = planos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = planos.professional_id AND p.user_id = auth.uid()));

GRANT SELECT ON public.planos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planos TO authenticated;
GRANT ALL ON public.planos TO service_role;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_planos_atualizado ON public.planos;
CREATE TRIGGER trg_planos_atualizado BEFORE UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
