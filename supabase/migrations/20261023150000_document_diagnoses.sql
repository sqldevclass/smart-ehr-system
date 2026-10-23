-- Per-document diagnoses for the Протокол операции pre-/post-operative tabs.
--
-- patient_diagnoses is the hospitalization-wide working list and is read by reports
-- (ALOS, readmission, top diagnoses, VTE) and by the patient history. Pre-/post-op
-- diagnoses describe one moment of one document, so they live in their own table:
-- they never leak into those readers and are removed together with the document.
--
-- Same model as patient_diagnoses (ICD-10 code + diagnosis_type + note), plus:
--   document_id  the protocol the diagnosis belongs to
--   phase        'preop' | 'postop'
-- At most ONE 'main' diagnosis per (document, phase): the discrepancy report compares
-- exactly one value per phase, so the database enforces it, not the UI.

create table public.document_diagnoses (
  id             uuid primary key default gen_random_uuid(),
  hospital_id    uuid not null references public.hospitals(id) on delete cascade,
  document_id    uuid not null references public.patient_documents(id) on delete cascade,
  phase          text not null,
  icd10_code     text not null references public.icd10_codes(code),
  diagnosis_type text not null,
  notes          text,
  recorded_by    uuid references public.profiles(id),
  recorded_at    timestamptz not null default now(),
  constraint document_diagnoses_phase_check
    check (phase in ('preop', 'postop')),
  constraint document_diagnoses_type_check
    check (diagnosis_type in ('main', 'complication', 'competing', 'background', 'comorbid'))
);

-- A code appears once per phase of a document.
create unique index document_diagnoses_code_uq
  on public.document_diagnoses (document_id, phase, icd10_code);
-- One main diagnosis per phase of a document.
create unique index document_diagnoses_one_main_uq
  on public.document_diagnoses (document_id, phase) where diagnosis_type = 'main';
create index document_diagnoses_icd10_idx on public.document_diagnoses (icd10_code);
create index document_diagnoses_hospital_idx on public.document_diagnoses (hospital_id);

alter table public.document_diagnoses enable row level security;

create policy document_diagnoses_select on public.document_diagnoses
  for select to authenticated
  using (hospital_id = public.get_my_hospital_id());

-- The document must belong to the same hospital as the row (FKs do not check tenants).
create policy document_diagnoses_insert on public.document_diagnoses
  for insert to authenticated
  with check (
    hospital_id = public.get_my_hospital_id()
    and public.has_permission('documents.create')
    and exists (
      select 1 from public.patient_documents d
       where d.id = document_id and d.hospital_id = document_diagnoses.hospital_id
    )
  );

create policy document_diagnoses_update on public.document_diagnoses
  for update to authenticated
  using (hospital_id = public.get_my_hospital_id() and public.has_permission('documents.edit'))
  with check (hospital_id = public.get_my_hospital_id() and public.has_permission('documents.edit'));

create policy document_diagnoses_delete on public.document_diagnoses
  for delete to authenticated
  using (hospital_id = public.get_my_hospital_id() and public.has_permission('documents.edit'));

revoke all on public.document_diagnoses from anon;
revoke truncate, references, trigger on public.document_diagnoses from authenticated;
grant select, insert, update, delete on public.document_diagnoses to authenticated;

create trigger document_diagnoses_audit
  after insert or update or delete on public.document_diagnoses
  for each row execute function public.audit_trigger_func();

-- Протокол операции no longer uses the single-value text fields diag.preop / diag.postop
-- (the field definitions stay: other document types still use them). The two tabs are
-- now hard-wired to document_diagnoses by section code, like the "diagnosis" tab is.
delete from public.document_type_fields dtf
 using public.document_types dt, public.field_definitions fd
 where dt.code = 'operation_protocol'
   and dtf.document_type_id = dt.id
   and fd.id = dtf.field_definition_id
   and fd.attribute_code in ('diag.preop', 'diag.postop');
