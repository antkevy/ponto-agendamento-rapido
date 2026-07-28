
-- Public booking + read access
GRANT SELECT, INSERT ON public.appointments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

GRANT SELECT ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;

GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;

GRANT SELECT ON public.availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;

GRANT SELECT ON public.blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;

GRANT SELECT ON public.employees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

GRANT SELECT ON public.employee_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_services TO authenticated;
GRANT ALL ON public.employee_services TO service_role;

GRANT SELECT ON public.employee_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_availability TO authenticated;
GRANT ALL ON public.employee_availability TO service_role;

GRANT SELECT ON public.employee_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_blocks TO authenticated;
GRANT ALL ON public.employee_blocks TO service_role;

-- RPCs used publicly
GRANT EXECUTE ON FUNCTION public.get_busy_slots(uuid, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_busy_slots(uuid, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(uuid, text) TO anon, authenticated;
