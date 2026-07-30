ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS story text,
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS values_text text,
  ADD COLUMN IF NOT EXISTS differentials text,
  ADD COLUMN IF NOT EXISTS opening_hours_display text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS linkedin text,
  ADD COLUMN IF NOT EXISTS youtube text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS button_style text NOT NULL DEFAULT 'pill',
  ADD COLUMN IF NOT EXISTS corner_radius text NOT NULL DEFAULT 'rounded',
  ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS show_employees boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_policy text,
  ADD COLUMN IF NOT EXISTS terms text;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS experience_years integer,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS services_done integer NOT NULL DEFAULT 0;

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS category text;

CREATE TABLE IF NOT EXISTS public.depoimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_photo text,
  rating smallint NOT NULL DEFAULT 5,
  comment text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.depoimentos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depoimentos TO authenticated;
GRANT ALL ON public.depoimentos TO service_role;
ALTER TABLE public.depoimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read depoimentos" ON public.depoimentos;
CREATE POLICY "public read depoimentos" ON public.depoimentos FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage depoimentos" ON public.depoimentos;
CREATE POLICY "owner manage depoimentos" ON public.depoimentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = depoimentos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = depoimentos.professional_id AND p.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.galeria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.galeria TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.galeria TO authenticated;
GRANT ALL ON public.galeria TO service_role;
ALTER TABLE public.galeria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read galeria" ON public.galeria;
CREATE POLICY "public read galeria" ON public.galeria FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage galeria" ON public.galeria;
CREATE POLICY "owner manage galeria" ON public.galeria FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = galeria.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = galeria.professional_id AND p.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faq TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq TO authenticated;
GRANT ALL ON public.faq TO service_role;
ALTER TABLE public.faq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read faq" ON public.faq;
CREATE POLICY "public read faq" ON public.faq FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage faq" ON public.faq;
CREATE POLICY "owner manage faq" ON public.faq FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = faq.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = faq.professional_id AND p.user_id = auth.uid()));