-- =====================================================================
-- Backfill idempotente: popula public.clientes a partir dos agendamentos
-- existentes e garante o trigger de vínculo automático.
-- Seguro rodar mais de uma vez.
-- =====================================================================

-- Garante a tabela clientes (mesma estrutura da criação original)
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (professional_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_clientes_professional ON public.clientes(professional_id);
CREATE INDEX IF NOT EXISTS idx_clientes_phone ON public.clientes(phone);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manage clientes" ON public.clientes;
CREATE POLICY "owner manage clientes" ON public.clientes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = clientes.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = clientes.professional_id AND p.user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

-- Garante o trigger de vínculo automático cliente <-> agendamento
CREATE OR REPLACE FUNCTION public.auto_link_client()
RETURNS TRIGGER AS $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM public.clientes
  WHERE professional_id = NEW.professional_id AND phone = NEW.client_phone
  LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.clientes (professional_id, name, phone, email)
    VALUES (NEW.professional_id, NEW.client_name, NEW.client_phone, NEW.client_email)
    RETURNING id INTO cid;
  ELSE
    UPDATE public.clientes SET name = NEW.client_name, email = COALESCE(NEW.client_email, email), updated_at = now()
    WHERE id = cid;
  END IF;
  NEW.client_id = cid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_link_client ON public.agendamentos;
CREATE TRIGGER trg_auto_link_client
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_client();

-- Backfill: cria um cliente por (professional_id, phone) usando o registro
-- mais recente do agendamento como nome/email e o mais antigo como created_at.
INSERT INTO public.clientes (professional_id, name, phone, email, notes, created_at)
SELECT s.professional_id, s.name, s.phone, s.email, NULL, s.created_at
FROM (
  SELECT DISTINCT ON (a.professional_id, a.client_phone)
    a.professional_id,
    a.client_name AS name,
    a.client_phone AS phone,
    a.client_email AS email,
    MIN(a.created_at) OVER (PARTITION BY a.professional_id, a.client_phone) AS created_at
  FROM public.agendamentos a
  WHERE a.client_phone IS NOT NULL AND btrim(a.client_phone) <> ''
  ORDER BY a.professional_id, a.client_phone, a.created_at DESC
) s
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes c
  WHERE c.professional_id = s.professional_id AND c.phone = s.phone
);

-- Vincula os agendamentos existentes aos clientes recém-criados
UPDATE public.agendamentos a
SET client_id = c.id
FROM public.clientes c
WHERE c.professional_id = a.professional_id
  AND c.phone = a.client_phone
  AND a.client_id IS NULL;
