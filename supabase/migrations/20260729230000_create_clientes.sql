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
