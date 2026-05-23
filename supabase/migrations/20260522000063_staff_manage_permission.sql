-- Migration 063: Add staff.manage permission for HR role

INSERT INTO public.permissions (code, name_ru, name_en, module)
VALUES ('staff.manage', 'Управление персоналом',
  'Manage Staff', 'hr')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code = 'hr'
  AND p.code = 'staff.manage'
ON CONFLICT DO NOTHING;