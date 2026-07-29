-- Landing page fields and tables

-- Profissionais: new columns
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS story TEXT;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS opening_hours_display TEXT;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS facebook TEXT;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS clients_served_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1) NOT NULL DEFAULT 5.0;

-- Funcionarios: new columns
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 0;
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS bio TEXT;

-- Depoimentos
CREATE TABLE IF NOT EXISTS public.depoimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_photo TEXT,
  comment TEXT NOT NULL,
  rating SMALLINT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depoimentos_profissional ON public.depoimentos(professional_id);

ALTER TABLE public.depoimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read depoimentos" ON public.depoimentos;
CREATE POLICY "public read depoimentos" ON public.depoimentos
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "owner manage depoimentos" ON public.depoimentos;
CREATE POLICY "owner manage depoimentos" ON public.depoimentos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = depoimentos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = depoimentos.professional_id AND p.user_id = auth.uid()));

GRANT SELECT ON public.depoimentos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depoimentos TO authenticated;
GRANT ALL ON public.depoimentos TO service_role;

-- Galeria
CREATE TABLE IF NOT EXISTS public.galeria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  category TEXT NOT NULL DEFAULT 'ambiente',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_galeria_profissional ON public.galeria(professional_id);

ALTER TABLE public.galeria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read galeria" ON public.galeria;
CREATE POLICY "public read galeria" ON public.galeria
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "owner manage galeria" ON public.galeria;
CREATE POLICY "owner manage galeria" ON public.galeria
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = galeria.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = galeria.professional_id AND p.user_id = auth.uid()));

GRANT SELECT ON public.galeria TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.galeria TO authenticated;
GRANT ALL ON public.galeria TO service_role;
