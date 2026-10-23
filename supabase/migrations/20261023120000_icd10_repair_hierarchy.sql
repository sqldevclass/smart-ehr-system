-- ICD-10 hierarchy repair (level, parent_code, is_leaf) derived from the codes themselves.
--
-- Problems in the seeded data:
--   * 408 categories without subcodes (e.g. I10) had is_leaf = false  -> not selectable
--     in any ICD-10 search box (the shared search only offers is_leaf = true).
--   * 10 block headers (D65-D69, W00-W19, ...) had is_leaf = true      -> selectable although
--     they are ranges, not diagnoses.
--   * 421 rows were their own parent, and levels were inconsistent (I10 level 2, I11 level 1).
--
-- Structure, from the code text:
--   chapter  ^[A-Z]$                        level 1, no parent, never selectable
--   block    A00-A09                        level 2, parent = chapter letter, never selectable
--   category A03 / D63*                     level 3, parent = narrowest block containing it,
--                                           selectable only when it has no subcodes
--   subcode  A03.0 / D63.0* / M50.0†        level 4, parent = its category (same 3-char base),
--                                           always selectable
-- Subcodes whose category row does not exist hang off the narrowest containing block.
-- Only level / parent_code / is_leaf are written; code and name_ru are untouched.

with c as (
  select id, code,
    case when code ~ '^[A-Z]$' then 'chapter'
         when code ~ '^[A-Z][0-9]{2}-[A-Z][0-9]{2}$' then 'block'
         when code ~ '^[A-Z][0-9]{2}[*+†]?$' then 'category'
         when code ~ '^[A-Z][0-9]{2}' then 'subcode'
         else 'other' end as kind,
    substring(code from '^[A-Z][0-9]{2}') as base,
    substring(code from '[*+†]$') as mark
  from public.icd10_codes
), blocks as (
  select code,
         ascii(left(split_part(code, '-', 1), 1)) * 100 + substring(split_part(code, '-', 1) from 2 for 2)::int as lo,
         ascii(left(split_part(code, '-', 2), 1)) * 100 + substring(split_part(code, '-', 2) from 2 for 2)::int as hi
  from c where kind = 'block'
), cats as (
  select base, code, mark from c where kind = 'category'
), fix as (
  select c.id, c.code, c.kind,
    case c.kind when 'chapter' then 1 when 'block' then 2 when 'category' then 3 else 4 end as new_level,
    case c.kind
      when 'chapter' then null
      when 'block' then left(c.code, 1)
      when 'category' then coalesce(
        (select b.code from blocks b
          where ascii(left(c.base, 1)) * 100 + substring(c.base from 2 for 2)::int between b.lo and b.hi
          order by (b.hi - b.lo), b.code limit 1),
        left(c.code, 1))
      else coalesce(
        (select k.code from cats k where k.base = c.base
          order by (k.mark is not distinct from c.mark) desc, k.code limit 1),
        (select b.code from blocks b
          where ascii(left(c.base, 1)) * 100 + substring(c.base from 2 for 2)::int between b.lo and b.hi
          order by (b.hi - b.lo), b.code limit 1),
        left(c.code, 1))
    end as new_parent,
    case c.kind
      when 'chapter' then false
      when 'block' then false
      when 'category' then not exists (select 1 from c s where s.kind = 'subcode' and s.base = c.base)
      else true
    end as new_leaf
  from c
  where c.kind <> 'other'
)
update public.icd10_codes t
   set level = f.new_level,
       parent_code = f.new_parent,
       is_leaf = f.new_leaf
  from fix f
 where f.id = t.id
   and (t.level is distinct from f.new_level
        or t.parent_code is distinct from f.new_parent
        or t.is_leaf is distinct from f.new_leaf);

-- Guard rails: fail the migration (and roll it back) if the result is not consistent.
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.icd10_codes where parent_code = code;
  if v_bad > 0 then raise exception 'icd10 repair: % rows are their own parent', v_bad; end if;

  select count(*) into v_bad from public.icd10_codes c
   where c.parent_code is not null
     and not exists (select 1 from public.icd10_codes p where p.code = c.parent_code);
  if v_bad > 0 then raise exception 'icd10 repair: % rows have a missing parent', v_bad; end if;

  select count(*) into v_bad from public.icd10_codes c
   where c.is_leaf
     and exists (select 1 from public.icd10_codes k where k.parent_code = c.code);
  if v_bad > 0 then raise exception 'icd10 repair: % selectable codes still have children', v_bad; end if;

  select count(*) into v_bad from public.icd10_codes c
   where not c.is_leaf and c.level >= 3
     and not exists (select 1 from public.icd10_codes k where k.parent_code = c.code);
  if v_bad > 0 then raise exception 'icd10 repair: % non-selectable codes have no children', v_bad; end if;
end $$;
