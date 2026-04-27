-- Migration 014: Queue Management
-- queue_configs and queue_numbers
-- Supports both slot-based and live queue modes
-- TV display via unauthenticated display_token URL

-- ============================================================
-- QUEUE CONFIGS
-- One config per physician (queue mode) or room
-- Each config has a unique display_token for the TV URL
-- ============================================================

CREATE TABLE public.queue_configs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  physician_id  uuid REFERENCES public.physicians(id) ON DELETE CASCADE,
  room_id       uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  queue_date    date NOT NULL DEFAULT current_date,
  display_token text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  last_number   int DEFAULT 0,
  is_active     boolean DEFAULT true,
  reset_at      timestamptz,
  CONSTRAINT queue_config_has_target
    CHECK (physician_id IS NOT NULL OR room_id IS NOT NULL)
);

CREATE INDEX queue_configs_hospital_idx ON public.queue_configs(hospital_id);
CREATE INDEX queue_configs_physician_idx ON public.queue_configs(physician_id);
CREATE INDEX queue_configs_token_idx ON public.queue_configs(display_token);

ALTER TABLE public.queue_configs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their hospital's queue configs
CREATE POLICY "queue_configs_select_auth" ON public.queue_configs
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- Unauthenticated access by display_token (for TV display)
CREATE POLICY "queue_configs_select_anon" ON public.queue_configs
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "queue_configs_insert" ON public.queue_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.add')
  );

CREATE POLICY "queue_configs_update" ON public.queue_configs
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- QUEUE NUMBERS
-- One row per patient per queue session
-- ============================================================

CREATE TABLE public.queue_numbers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_config_id  uuid NOT NULL REFERENCES public.queue_configs(id) ON DELETE CASCADE,
  visit_service_id uuid REFERENCES public.visit_services(id) ON DELETE CASCADE,
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  queue_number     int NOT NULL,
  status           text DEFAULT 'waiting'
                     CHECK (status IN ('waiting','called','completed','skipped')),
  issued_at        timestamptz DEFAULT now(),
  called_at        timestamptz,
  completed_at     timestamptz,
  UNIQUE (queue_config_id, queue_number)
);

CREATE INDEX queue_numbers_config_idx ON public.queue_numbers(queue_config_id);
CREATE INDEX queue_numbers_hospital_idx ON public.queue_numbers(hospital_id);
CREATE INDEX queue_numbers_status_idx ON public.queue_numbers(status);

ALTER TABLE public.queue_numbers ENABLE ROW LEVEL SECURITY;

-- Authenticated users
CREATE POLICY "queue_numbers_select_auth" ON public.queue_numbers
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- Unauthenticated access for TV display
CREATE POLICY "queue_numbers_select_anon" ON public.queue_numbers
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "queue_numbers_insert" ON public.queue_numbers
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.add')
  );

CREATE POLICY "queue_numbers_update" ON public.queue_numbers
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- Enable Realtime on queue tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_configs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_numbers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_services;

-- ============================================================
-- assign_queue_number RPC function
-- Atomically assigns the next queue number to a visit service
-- Prevents duplicate numbers via FOR UPDATE lock
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_queue_number(
  p_queue_config_id  uuid,
  p_visit_service_id uuid,
  p_hospital_id      uuid
)
RETURNS public.queue_numbers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number int;
  v_queue_number public.queue_numbers;
BEGIN
  -- Lock config row and get next number
  UPDATE public.queue_configs
  SET last_number = last_number + 1
  WHERE id = p_queue_config_id
  RETURNING last_number INTO v_next_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue config not found: %', p_queue_config_id;
  END IF;

  -- Insert queue number
  INSERT INTO public.queue_numbers (
    queue_config_id,
    visit_service_id,
    hospital_id,
    queue_number,
    status
  ) VALUES (
    p_queue_config_id,
    p_visit_service_id,
    p_hospital_id,
    v_next_number,
    'waiting'
  )
  RETURNING * INTO v_queue_number;

  RETURN v_queue_number;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Queue number assignment failed: %', SQLERRM;
END;
$$;