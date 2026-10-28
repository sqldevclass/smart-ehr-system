-- Role management: tenant-scoped custom roles built from permissions.
--
--   * roles become tenant-aware. hospital_id NULL = system role (shared, read-only);
--     hospital_id set = custom role owned by that hospital. Role codes stay globally unique (generated for custom roles).
--   * roles can be deactivated: an inactive role grants nothing (has_permission / has_role).
--   * permissions get an access_type (read / write / delete / approve / manage / access) so the
--     role editor can show a read/write/delete view over the real, enforced activities.
--   * "workspace.*" permissions gate the workspace shells (cashier, nurse, ...) so a custom role
--     can open the right area. They are seeded to the system roles that open those areas today.
--   * Roles are written ONLY through SECURITY DEFINER functions behind system.manage_roles:
--     save_role, set_role_active, delete_role. Direct table writes are revoked.
--   * Hardening: roles/role_permissions are visible only within the caller's tenant; a role can
--     only be assigned if it belongs to the caller's hospital or is a system role; only an admin
--     can assign or remove the admin role; anon access and TRUNCATE are revoked.

-- ------------------------------------------------------------ roles: tenant scope, active, metadata
update public.roles set is_system = true where is_system is null;

alter table public.roles
  add column if not exists hospital_id uuid references public.hospitals(id) on delete cascade,
  add column if not exists is_active   boolean not null default true,
  add column if not exists description text,
  add column if not exists created_by  uuid references public.profiles(id),
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();

alter table public.roles
  alter column is_system set default false,
  alter column is_system set not null;

alter table public.roles
  add constraint roles_scope_chk
  check ((is_system and hospital_id is null) or (not is_system and hospital_id is not null));

-- code stays globally unique (profiles.default_role_code references it); custom role codes are
-- generated ('custom_' + random suffix), so they can never collide with a system role or another
-- hospital's role. Names are unique per hospital.
create unique index roles_hospital_name_uq on public.roles (hospital_id, lower(name_ru)) where hospital_id is not null;

create trigger audit_roles
  after insert or update or delete on public.roles
  for each row execute function public.audit_trigger_func();

-- ------------------------------------------------------------ permissions: access type
alter table public.permissions add column if not exists access_type text;

-- ------------------------------------------------------------ new permissions
insert into public.permissions (code, name_ru, name_en, module)
select v.code, v.name_ru, v.name_en, v.module
from (values
  ('system.manage_roles',           'Управление ролями',                     'Manage roles',                  'system'),
  ('finance.view_revenue_report',   'Просмотр отчёта по выручке (услуги)',   'View revenue by service report','finance'),
  ('workspace.physician',  'Рабочее место: Врач',                  'Workspace: Physician',           'workspace'),
  ('workspace.registrar',  'Рабочее место: Регистратура',          'Workspace: Registrar',           'workspace'),
  ('workspace.inpatient',  'Рабочее место: Регистратура стационара','Workspace: Inpatient registrar', 'workspace'),
  ('workspace.nurse',      'Рабочее место: Медсестра',             'Workspace: Nurse',               'workspace'),
  ('workspace.lab',        'Рабочее место: Лаборатория',           'Workspace: Laboratory',          'workspace'),
  ('workspace.cashier',    'Рабочее место: Касса',                 'Workspace: Cashier',             'workspace'),
  ('workspace.finance',    'Рабочее место: Финансы',               'Workspace: Finance',             'workspace'),
  ('workspace.pharmacy',   'Рабочее место: Аптека',                'Workspace: Pharmacy',            'workspace'),
  ('workspace.warehouse',  'Рабочее место: Склад',                 'Workspace: Warehouse',           'workspace'),
  ('workspace.inventory',  'Рабочее место: Инвентаризация',        'Workspace: Inventory',           'workspace'),
  ('workspace.hr',         'Рабочее место: HR',                    'Workspace: HR',                  'workspace')
) as v(code, name_ru, name_en, module)
where not exists (select 1 from public.permissions p where p.code = v.code);

-- classification of every permission
update public.permissions p set access_type = case
  when p.module = 'workspace' then 'access'
  when p.code in (
    'finance.view_discount_report','finance.view_patient_advances','finance.view_patient_debts',
    'finance.view_payroll','finance.view_revenue_report','patients.view_all',
    'reports.view_bed_occupancy','reports.view_daily','warehouse.department_view','warehouse.view_all'
  ) then 'read'
  when p.code in (
    'finance.delete_payroll_adjustment','invoices.cancel','prescriptions.cancel','services.delete'
  ) then 'delete'
  when p.code in (
    'finance.confirm_payroll','payments.refund_approve','warehouse.transfer_accept'
  ) then 'approve'
  when p.code in (
    'finance.manage_discounts','finance.manage_pay_rates','staff.manage','payments.manage_kassas',
    'payments.manage_terminals','reports.manage_plans','schedules.manage',
    'system.manage_document_templates','system.manage_services','system.manage_settings',
    'system.manage_users','system.manage_roles'
  ) then 'manage'
  else 'write'
end;

alter table public.permissions alter column access_type set not null;
alter table public.permissions
  add constraint permissions_access_type_chk
  check (access_type in ('read','write','delete','approve','manage','access'));

-- ------------------------------------------------------------ seed grants (keep current behaviour)
-- admin: every permission it does not hold yet (incl. the new ones)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin' and r.hospital_id is null
  and p.code in (
    'system.manage_roles','finance.view_revenue_report',
    'workspace.physician','workspace.registrar','workspace.inpatient','workspace.nurse','workspace.lab',
    'workspace.cashier','workspace.finance','workspace.pharmacy','workspace.warehouse',
    'workspace.inventory','workspace.hr'
  )
  and not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- system roles -> the workspace they open today (same lists as the route guards)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (values
  ('physician','workspace.physician'),
  ('outpatient_registrar','workspace.registrar'),
  ('inpatient_registrar','workspace.inpatient'),
  ('inpatient_nurse','workspace.nurse'),
  ('head_nurse','workspace.nurse'),
  ('lab_physician','workspace.lab'),
  ('blood_draw_nurse','workspace.lab'),
  ('cashier','workspace.cashier'),
  ('finance','workspace.finance'),
  ('pharmacist','workspace.pharmacy'),
  ('warehouse_staff','workspace.warehouse'),
  ('inventory_manager','workspace.inventory'),
  ('hr','workspace.hr'),
  -- the revenue-by-service report tab was finance-only; the daily report tabs were also open to
  -- finance in the UI, but reports.view_daily was never granted to it
  ('finance','finance.view_revenue_report'),
  ('finance','reports.view_daily')
) as m(role_code, perm_code)
join public.roles r on r.code = m.role_code and r.hospital_id is null
join public.permissions p on p.code = m.perm_code
where not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- ------------------------------------------------------------ authorization functions
-- Inactive roles grant nothing; custom roles count only inside their own hospital.
create or replace function public.has_permission(perm_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
                         and r.is_active
                         and (r.hospital_id is null or r.hospital_id = public.get_my_hospital_id())
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and ur.hospital_id = public.get_my_hospital_id()
        and p.code = perm_code
    )
    or exists (
      select 1
      from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = auth.uid()
        and up.hospital_id = public.get_my_hospital_id()
        and p.code = perm_code
        and up.granted = true
    )
  )
  and not exists (
    select 1
    from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
    where up.user_id = auth.uid()
      and up.hospital_id = public.get_my_hospital_id()
      and p.code = perm_code
      and up.granted = false
  )
$$;

create or replace function public.has_role(role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.hospital_id = public.get_my_hospital_id()
      and r.is_active
      and (r.hospital_id is null or r.hospital_id = public.get_my_hospital_id())
      and r.code = role_code
  )
$$;

-- Effective permission codes of the current user (single source of truth: has_permission).
create or replace function public.get_my_permissions()
returns setof text
language sql
stable
set search_path = public
as $$
  select p.code from public.permissions p where public.has_permission(p.code) order by p.code
$$;

-- ------------------------------------------------------------ row level security
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using (hospital_id is null or hospital_id = public.get_my_hospital_id());

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id));

-- assigning: the role must be active and belong to this hospital (or be a system role);
-- only an admin can hand out or take away the admin role.
drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (
    hospital_id = public.get_my_hospital_id()
    and public.has_permission('system.manage_users')
    and exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.is_active
        and (r.hospital_id is null or r.hospital_id = public.get_my_hospital_id())
        and (r.code <> 'admin' or public.has_role('admin'))
    )
  );

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (
    hospital_id = public.get_my_hospital_id()
    and public.has_permission('system.manage_users')
    and (
      public.has_role('admin')
      or not exists (select 1 from public.roles r where r.id = role_id and r.code = 'admin')
    )
  );

-- ------------------------------------------------------------ table grants
revoke all on public.roles, public.role_permissions, public.permissions from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.roles, public.role_permissions, public.permissions from authenticated;
grant select on public.roles, public.role_permissions, public.permissions to authenticated;

-- ------------------------------------------------------------ management functions
create or replace function public.get_roles_overview()
returns table(
  id uuid, code text, name_ru text, description text,
  is_system boolean, is_active boolean, dashboard_route text,
  user_count integer, permission_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hospital uuid := public.get_my_hospital_id();
begin
  if v_hospital is null or not public.has_permission('system.manage_roles') then
    raise exception 'Not authorized to manage roles';
  end if;

  return query
  select r.id, r.code, r.name_ru, r.description, r.is_system, r.is_active, r.dashboard_route,
         (select count(*)::int from public.user_roles ur
           where ur.role_id = r.id and ur.hospital_id = v_hospital),
         (select count(*)::int from public.role_permissions rp where rp.role_id = r.id)
  from public.roles r
  where r.hospital_id is null or r.hospital_id = v_hospital
  order by r.is_system desc, r.name_ru;
end;
$$;

-- Create (p_role_id null) or update a custom role together with its full permission set.
create or replace function public.save_role(
  p_role_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_dashboard_route text,
  p_permission_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_name     text := btrim(coalesce(p_name, ''));
  v_ids      uuid[];
  v_role     uuid;
  v_old      jsonb;
  v_new      jsonb;
begin
  if v_hospital is null or not public.has_permission('system.manage_roles') then
    raise exception 'Not authorized to manage roles';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Role name is required (max 100 characters)';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_permission_ids, '{}')) as x;
  if (select count(*) from public.permissions where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'Unknown permission in the list';
  end if;

  if p_dashboard_route is not null and not exists (
    select 1 from public.permissions p
    where p.id = any(v_ids) and p.code = 'workspace.' || ltrim(p_dashboard_route, '/')
  ) then
    raise exception 'The landing page must be one of the role''s workspaces';
  end if;

  begin
    if p_role_id is null then
      insert into public.roles (code, name_ru, name_en, description, is_system, is_active,
                                dashboard_route, hospital_id, created_by)
      values ('custom_' || substr(md5(gen_random_uuid()::text), 1, 10),
              v_name, v_name, nullif(btrim(coalesce(p_description, '')), ''), false,
              coalesce(p_is_active, true), p_dashboard_route, v_hospital, auth.uid())
      returning id into v_role;
    else
      select r.id into v_role
      from public.roles r
      where r.id = p_role_id and r.hospital_id = v_hospital and not r.is_system
      for update;
      if v_role is null then
        raise exception 'Role not found or is not editable';
      end if;
      update public.roles
      set name_ru = v_name, name_en = v_name,
          description = nullif(btrim(coalesce(p_description, '')), ''),
          is_active = coalesce(p_is_active, true),
          dashboard_route = p_dashboard_route,
          updated_at = now()
      where id = v_role;
    end if;
  exception when unique_violation then
    raise exception 'A role with this name already exists';
  end;

  -- a non-admin cannot grant what they do not hold themselves
  if not public.has_role('admin') and exists (
    select 1 from public.permissions p
    where p.id = any(v_ids)
      and not public.has_permission(p.code)
      and not exists (select 1 from public.role_permissions rp
                      where rp.role_id = v_role and rp.permission_id = p.id)
  ) then
    raise exception 'You cannot grant permissions you do not hold';
  end if;

  select coalesce(jsonb_agg(p.code order by p.code), '[]') into v_old
  from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
  where rp.role_id = v_role;

  delete from public.role_permissions where role_id = v_role;
  insert into public.role_permissions (role_id, permission_id)
  select v_role, x from unnest(v_ids) as x;

  select coalesce(jsonb_agg(p.code order by p.code), '[]') into v_new
  from public.permissions p where p.id = any(v_ids);

  insert into public.audit_logs (hospital_id, table_name, record_id, operation,
                                 old_values, new_values, performed_by, performed_at)
  values (v_hospital, 'role_permissions', v_role,
          case when p_role_id is null then 'INSERT' else 'UPDATE' end,
          jsonb_build_object('permission_codes', v_old),
          jsonb_build_object('permission_codes', v_new),
          auth.uid(), now());

  return v_role;
end;
$$;

-- Activate / deactivate a custom role. Returns how many users hold it.
create or replace function public.set_role_active(p_role_id uuid, p_is_active boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_users    integer;
begin
  if v_hospital is null or not public.has_permission('system.manage_roles') then
    raise exception 'Not authorized to manage roles';
  end if;

  update public.roles
  set is_active = coalesce(p_is_active, true), updated_at = now()
  where id = p_role_id and hospital_id = v_hospital and not is_system;
  if not found then
    raise exception 'Role not found or is not editable';
  end if;

  select count(*)::int into v_users
  from public.user_roles where role_id = p_role_id and hospital_id = v_hospital;
  return v_users;
end;
$$;

-- Delete a custom role that nobody holds (otherwise deactivate it).
create or replace function public.delete_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
begin
  if v_hospital is null or not public.has_permission('system.manage_roles') then
    raise exception 'Not authorized to manage roles';
  end if;

  perform 1 from public.roles
  where id = p_role_id and hospital_id = v_hospital and not is_system
  for update;
  if not found then
    raise exception 'Role not found or is not editable';
  end if;

  if exists (select 1 from public.user_roles where role_id = p_role_id) then
    raise exception 'The role is assigned to users; deactivate it instead';
  end if;

  delete from public.roles where id = p_role_id;
end;
$$;

revoke execute on function public.get_roles_overview() from public, anon;
revoke execute on function public.save_role(uuid, text, text, boolean, text, uuid[]) from public, anon;
revoke execute on function public.set_role_active(uuid, boolean) from public, anon;
revoke execute on function public.delete_role(uuid) from public, anon;
revoke execute on function public.get_my_permissions() from public, anon;
grant execute on function public.get_roles_overview() to authenticated;
grant execute on function public.save_role(uuid, text, text, boolean, text, uuid[]) to authenticated;
grant execute on function public.set_role_active(uuid, boolean) to authenticated;
grant execute on function public.delete_role(uuid) to authenticated;
grant execute on function public.get_my_permissions() to authenticated;
