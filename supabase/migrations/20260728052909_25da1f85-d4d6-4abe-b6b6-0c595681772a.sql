
-- 1) Restrict public exposure of sensitive professional contact fields
REVOKE SELECT ON public.professionals FROM anon;
GRANT SELECT
  (id, user_id, slug, business_name, logo_url, brand_color, description, timezone, created_at, updated_at)
  ON public.professionals TO anon;

-- 2) Storage policies for brand-assets bucket (user-scoped by first folder segment)
DROP POLICY IF EXISTS "brand-assets public read" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets owner insert" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets owner update" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets owner delete" ON storage.objects;

CREATE POLICY "brand-assets public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'brand-assets');

CREATE POLICY "brand-assets owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "brand-assets owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "brand-assets owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3) Tighten the always-true public INSERT policy on appointments
DROP POLICY IF EXISTS "public create appointments" ON public.appointments;

CREATE POLICY "public create appointments"
  ON public.appointments FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    starts_at > now()
    AND ends_at > starts_at
    AND status = 'confirmed'
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = appointments.service_id
        AND s.professional_id = appointments.professional_id
        AND s.is_active
    )
    AND (
      employee_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = appointments.employee_id
          AND e.professional_id = appointments.professional_id
          AND e.is_active
      )
    )
  );
