-- Per-physician report: group by WHO rendered the service, not by name text
-- (two profiles can share a full name). Appends two columns at the end of the
-- view; everything else is unchanged.
--   rendered_by_person_id  -- same priority as rendered_by_name:
--                             completed_by profile -> assigned physician -> assigned staff role
--   rendered_by_profile_id -- completed_by profile (fallback key when no person is linked)
-- security_invoker is restated so CREATE OR REPLACE keeps RLS enforcement
-- (20261022150000_secure_report_views.sql).

create or replace view public.finance_revenue_report_items
with (security_invoker = true) as
 select vs.id as visit_service_id,
    vs.hospital_id,
    coalesce(vs.completed_at, vs.scheduled_at, vs.created_at) as report_date,
    vs.status_id,
    ss.code as service_status_code,
    ss.name_ru as service_status_name,
    vs.cost_at_time as revenue,
    vs.service_id,
    s.name as service_name,
    s.service_type_id,
    stt.name_ru as service_type_name,
    s.service_group_id,
    sg.name as service_group_name,
    s.service_subgroup_id,
    ssg.name as service_subgroup_name,
        case
            when vs.hospitalization_id is not null then 'inpatient'::text
            else 'outpatient'::text
        end as op_ip,
        case
            when vs.hospitalization_id is not null then h.department_id
            else sr_assigned.department_id
        end as department_id,
    coalesce(phys_sr.id, sr_assigned.id) as physician_staff_role_id,
    coalesce((phys_person.last_name || ' '::text) || phys_person.first_name, (assigned_person.last_name || ' '::text) || assigned_person.first_name, creator_profile.full_name) as physician_name,
    ii.invoice_id,
        case
            when ii.invoice_id is null then 'not_paid'::text
            when coalesce(pay.paid_amount, 0::numeric) <= 0::numeric then 'not_paid'::text
            when coalesce(pay.paid_amount, 0::numeric) >= coalesce(inv_total.total_amount, 0::numeric) then 'paid'::text
            else 'in_progress'::text
        end as payment_status,
    vs.patient_id,
    p.patient_number,
    p.first_name as patient_first_name,
    p.last_name as patient_last_name,
    p.date_of_birth as patient_dob,
    h.hospitalization_number,
    inv.invoice_number,
    creator_profile.full_name as referred_by_name,
    coalesce(completed_by_profile.full_name, (phys_person.last_name || ' '::text) || phys_person.first_name, (assigned_person.last_name || ' '::text) || assigned_person.first_name) as rendered_by_name,
    coalesce(completed_by_profile.person_id, phys_sr.person_id, sr_assigned.person_id) as rendered_by_person_id,
    completed_by_profile.id as rendered_by_profile_id
   from public.visit_services vs
     join public.service_statuses ss on ss.id = vs.status_id
     join public.services s on s.id = vs.service_id
     left join public.service_types stt on stt.id = s.service_type_id
     left join public.service_groups sg on sg.id = s.service_group_id
     left join public.service_subgroups ssg on ssg.id = s.service_subgroup_id
     left join public.hospitalizations h on h.id = vs.hospitalization_id
     left join public.staff_roles sr_assigned on sr_assigned.id = vs.assigned_staff_role_id
     left join public.persons assigned_person on assigned_person.id = sr_assigned.person_id
     left join public.physicians phys on phys.id = vs.assigned_physician_id
     left join public.staff_roles phys_sr on phys_sr.id = phys.staff_role_id
     left join public.persons phys_person on phys_person.id = phys_sr.person_id
     left join public.profiles creator_profile on creator_profile.id = vs.created_by
     left join public.profiles completed_by_profile on completed_by_profile.id = vs.completed_by
     left join public.patients p on p.id = vs.patient_id
     left join public.invoice_items ii on ii.visit_service_id = vs.id
     left join public.invoices inv on inv.id = ii.invoice_id
     left join lateral ( select sum(ii2.amount) as total_amount
           from public.invoice_items ii2
          where ii2.invoice_id = ii.invoice_id) inv_total on true
     left join lateral ( select coalesce(( select sum(pay2.amount) as sum
                   from public.payments pay2
                  where pay2.invoice_id = ii.invoice_id and pay2.is_refunded = false), 0::numeric) + coalesce(( select sum(dep2.amount) as sum
                   from public.patient_deposit_ledger dep2
                  where dep2.invoice_id = ii.invoice_id and dep2.transaction_type = 'applied_to_invoice'::text), 0::numeric) as paid_amount) pay on true;
