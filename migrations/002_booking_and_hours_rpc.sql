-- Atomic booking and operating-hours replacement.
-- Apply this migration in the Supabase SQL editor before deploying the matching API.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.consume_password_reset(
  p_token_hash TEXT,
  p_password_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_user_id UUID;
BEGIN
  SELECT user_id INTO reset_user_id
    FROM public.password_resets
    WHERE token = p_token_hash AND expires_at > now();

  IF reset_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM public.users WHERE id = reset_user_id FOR UPDATE;
  SELECT user_id INTO reset_user_id
    FROM public.password_resets
    WHERE token = p_token_hash AND expires_at > now()
    FOR UPDATE;
  IF reset_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.users
    SET password_hash = p_password_hash, token_version = COALESCE(token_version, 0) + 1
    WHERE id = reset_user_id;
  DELETE FROM public.password_resets WHERE user_id = reset_user_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_password_reset(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_reset(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_appointment_atomic(
  p_user_id UUID,
  p_barbershop_id UUID,
  p_service_id UUID,
  p_barber_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_notes TEXT,
  p_owner_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  shop_record RECORD;
  service_record RECORD;
  day_is_open BOOLEAN;
  day_open_time TIME;
  day_close_time TIME;
  appointment_id UUID;
  appointment_end TIME;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_barbershop_id::TEXT || ':' || p_date::TEXT, 0));

  SELECT id, owner_id, active, is_open, opening_time, closing_time
    INTO shop_record
    FROM public.barbershops
    WHERE id = p_barbershop_id;
  IF NOT FOUND OR shop_record.active IS NOT TRUE OR shop_record.is_open IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_CLOSED';
  END IF;
  IF p_owner_id IS NOT NULL AND shop_record.owner_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_NOT_OWNED';
  END IF;
  IF p_date < CURRENT_DATE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_IN_PAST';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_NOT_FOUND';
  END IF;

  SELECT id, price, duration_minutes
    INTO service_record
    FROM public.services
    WHERE id = p_service_id AND barbershop_id = p_barbershop_id AND active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SERVICE_NOT_FOUND';
  END IF;

  IF p_barber_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.barbers
    WHERE id = p_barber_id AND barbershop_id = p_barbershop_id AND active IS TRUE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BARBER_NOT_FOUND';
  END IF;

  SELECT is_open, open_time, close_time
    INTO day_is_open, day_open_time, day_close_time
    FROM public.business_hours
    WHERE barbershop_id = p_barbershop_id
      AND day_of_week = EXTRACT(DOW FROM p_date)::INTEGER;
  IF FOUND THEN
    IF day_is_open IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_CLOSED';
    END IF;
  ELSE
    IF EXTRACT(DOW FROM p_date)::INTEGER = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_CLOSED';
    END IF;
    day_open_time := COALESCE(shop_record.opening_time, '09:00'::TIME);
    day_close_time := CASE
      WHEN EXTRACT(DOW FROM p_date)::INTEGER = 6 THEN '13:00'::TIME
      ELSE COALESCE(shop_record.closing_time, '19:00'::TIME)
    END;
  END IF;

  appointment_end := p_start_time + make_interval(mins => service_record.duration_minutes);
  IF p_start_time < day_open_time OR p_start_time >= day_close_time OR appointment_end > day_close_time THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OUTSIDE_BUSINESS_HOURS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.services existing_service ON existing_service.id = a.service_id
    WHERE a.barbershop_id = p_barbershop_id
      AND a.date = p_date
      AND a.status IN ('confirmed', 'pending')
      AND a.start_time < appointment_end
      AND p_start_time < a.start_time + make_interval(mins => existing_service.duration_minutes)
      AND (p_barber_id IS NULL OR a.barber_id IS NULL OR a.barber_id = p_barber_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SLOT_UNAVAILABLE';
  END IF;

  INSERT INTO public.appointments (
    user_id, barbershop_id, service_id, barber_id, date, start_time, price, notes, status
  ) VALUES (
    p_user_id, p_barbershop_id, p_service_id, p_barber_id, p_date, p_start_time,
    service_record.price, NULLIF(p_notes, ''), 'confirmed'
  ) RETURNING id INTO appointment_id;

  RETURN appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment_atomic(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_atomic(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_business_hours(
  p_shop_id UUID,
  p_owner_id UUID,
  p_hours JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops WHERE id = p_shop_id AND owner_id = p_owner_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_NOT_OWNED';
  END IF;

  IF jsonb_typeof(p_hours) <> 'array' OR jsonb_array_length(p_hours) <> 7 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_HOURS';
  END IF;

  DELETE FROM public.business_hours WHERE barbershop_id = p_shop_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_hours)
  LOOP
    INSERT INTO public.business_hours (
      barbershop_id, day_of_week, is_open, open_time, close_time
    ) VALUES (
      p_shop_id,
      (item->>'day_of_week')::INTEGER,
      COALESCE((item->>'is_open')::BOOLEAN, TRUE),
      (item->>'open_time')::TIME,
      (item->>'close_time')::TIME
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.day_of_week), '[]'::JSONB)
    INTO result
    FROM public.business_hours h
    WHERE h.barbershop_id = p_shop_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_business_hours(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_business_hours(UUID, UUID, JSONB) TO service_role;
