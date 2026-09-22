-- Migration 185: remove "Медикаментозные назначения" from Выписной
-- эпикриз -- confirmed via direct query there are two similarly-
-- named fields on this document type ("Медикаментозные назначения"
-- and "...(проведённые)"); this removes only the first (redundant/
-- unused), leaving "(проведённые)" and the field_definition itself
-- (in case anything else references it) untouched.

DELETE FROM public.document_type_fields
WHERE id = '8c07aae0-b9c3-4e5a-ba44-2323eb0fd8e2';
