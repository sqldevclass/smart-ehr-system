-- Generic, reusable per-user "saved view" store. One row per (user, view_key).
-- First consumer: Finance -> Услуги column visibility
-- (view_key = 'finance_services_columns', preferences = { "visible_columns": [...] }).
-- Intended to be reused later for other saved-view needs (e.g. default
-- OP/IP or Department filters on Сводный отчет) by adding new view_key
-- values -- no new table/migration needed for those.

create table public.user_view_preferences (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  view_key text not null,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, view_key)
);

alter table public.user_view_preferences enable row level security;

create policy user_view_preferences_select
  on public.user_view_preferences for select
  using (hospital_id = public.get_my_hospital_id() and user_id = auth.uid());

create policy user_view_preferences_insert
  on public.user_view_preferences for insert
  with check (hospital_id = public.get_my_hospital_id() and user_id = auth.uid());

create policy user_view_preferences_update
  on public.user_view_preferences for update
  using (hospital_id = public.get_my_hospital_id() and user_id = auth.uid())
  with check (hospital_id = public.get_my_hospital_id() and user_id = auth.uid());

create policy user_view_preferences_delete
  on public.user_view_preferences for delete
  using (hospital_id = public.get_my_hospital_id() and user_id = auth.uid());
