-- Tabela de clientes
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

-- Adicionar client_id opcional nos agendamentos
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agendamentos_client ON public.agendamentos(client_id);

-- Trigger: vincula/cria cliente automaticamente ao inserir agendamento
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
