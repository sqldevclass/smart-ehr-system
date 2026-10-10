-- "Номер протокола вмешательства" (ir.protocol_number) is only used by
-- interventional_radiology, so this is a clean hide with no cross-document
-- impact.
update document_type_fields set is_visible = false
where id = 'd169c1a7-f9df-49fd-803f-6223363dc064';
