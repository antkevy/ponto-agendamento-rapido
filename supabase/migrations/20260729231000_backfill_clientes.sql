-- Popula a tabela clientes com dados únicos dos agendamentos existentes
INSERT INTO public.clientes (professional_id, name, phone, email, notes, created_at)
SELECT DISTINCT ON (a.professional_id, a.client_phone)
  a.professional_id,
  a.client_name,
  a.client_phone,
  a.client_email,
  NULL,
  MIN(a.created_at)
FROM public.agendamentos a
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes c
  WHERE c.professional_id = a.professional_id AND c.phone = a.client_phone
)
GROUP BY a.professional_id, a.client_name, a.client_phone, a.client_email;

-- Vincula agendamentos existentes aos clientes recém-criados
UPDATE public.agendamentos a
SET client_id = c.id
FROM public.clientes c
WHERE c.professional_id = a.professional_id AND c.phone = a.client_phone
  AND a.client_id IS NULL;
