-- create_clinic_block can also create basement floors (-1, -2, ...).
drop function public.create_clinic_block(text, integer);

create or replace function public.create_clinic_block(p_name text, p_floors integer, p_basements integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_id uuid;
begin
  if not has_permission('system.manage_settings') then raise exception 'Нет прав на изменение структуры клиники'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Укажите название блока'; end if;
  if p_floors is null or p_floors < 0 or p_floors > 100 then raise exception 'Количество этажей: от 0 до 100'; end if;
  if p_basements is null or p_basements < 0 or p_basements > 10 then raise exception 'Подвальных этажей: от 0 до 10'; end if;
  if p_floors + p_basements < 1 then raise exception 'В блоке должен быть хотя бы один этаж'; end if;
  begin
    insert into clinic_blocks (hospital_id, name) values (v_hosp, btrim(p_name)) returning id into v_id;
  exception when unique_violation then
    raise exception 'Блок с таким названием уже существует';
  end;
  insert into clinic_floors (hospital_id, block_id, number)
  select v_hosp, v_id, g from generate_series(-p_basements, p_floors) g where g <> 0;
  return v_id;
end $$;

revoke execute on function public.create_clinic_block(text, integer, integer) from public, anon;
grant  execute on function public.create_clinic_block(text, integer, integer) to authenticated;
