-- Tabela de produtos (venda no estabelecimento)
CREATE TABLE IF NOT EXISTS public.produtos (
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

CREATE INDEX IF NOT EXISTS idx_produtos_professional ON public.produtos(professional_id);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read produtos" ON public.produtos;
CREATE POLICY "public read produtos" ON public.produtos
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "owner manage produtos" ON public.produtos;
CREATE POLICY "owner manage produtos" ON public.produtos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = produtos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = produtos.professional_id AND p.user_id = auth.uid()));

GRANT SELECT ON public.produtos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_produtos_atualizado ON public.produtos;
CREATE TRIGGER trg_produtos_atualizado BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
