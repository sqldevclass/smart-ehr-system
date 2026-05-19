-- Migration 002: Lookup tables and seed data
-- Part 1: Roles

CREATE TABLE public.roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code      text UNIQUE NOT NULL,
  name_ru   text NOT NULL,
  name_en   text NOT NULL,
  is_system boolean DEFAULT true
);

INSERT INTO public.roles (code, name_ru, name_en) VALUES
  ('admin',                        'Администратор',                    'Administrator'),
  ('outpatient_registrar',         'Регистратор амбулатории',          'Outpatient Registrar'),
  ('call_center_registrar',        'Регистратор колл-центра',          'Call Center Registrar'),
  ('inpatient_registrar',          'Регистратор стационара',           'Inpatient Registrar'),
  ('cashier',                      'Кассир',                           'Cashier'),
  ('physician',                    'Врач',                             'Physician'),
  ('functional_diagnostics_physician', 'Врач функциональной диагностики', 'Functional Diagnostics Physician'),
  ('lab_physician',                'Врач лаборатории',                 'Laboratory Physician'),
  ('blood_draw_nurse',             'Медсестра кабинета забора крови',  'Blood Draw Nurse'),
  ('inpatient_nurse',              'Стационарная медсестра',           'Inpatient Nurse'),
  ('head_nurse',                   'Старшая медсестра',                'Head Nurse'),
  ('senior_manager',               'Старший менеджер',                 'Senior Manager'),
  ('hr',                           'HR',                               'HR'),
  ('finance',                      'Финансист',                        'Finance'),
  ('pharmacist',                   'Провизор',                         'Pharmacist'),
  ('warehouse_staff',              'Сотрудник склада',                 'Warehouse Staff'),
  ('inventory_manager',            'Инвентаризатор',                   'Inventory Manager'),
  ('radiology_technician',         'Рентген-лаборант',                 'Radiology Technician');

  -- Part 2: Permissions

CREATE TABLE public.permissions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code     text UNIQUE NOT NULL,
  name_ru  text NOT NULL,
  name_en  text NOT NULL,
  module   text NOT NULL
);

INSERT INTO public.permissions (code, name_ru, name_en, module) VALUES
  -- Patients
  ('patients.add',                    'Добавить пациента',                'Add patient',                    'patients'),
  ('patients.edit',                   'Редактировать пациента',           'Edit patient',                   'patients'),
  ('patients.view_all',               'Просмотр всех пациентов',          'View all patients',              'patients'),
  -- Services
  ('services.add',                    'Добавить услугу',                  'Add service',                    'services'),
  ('services.edit',                   'Редактировать услугу',             'Edit service',                   'services'),
  ('services.delete',                 'Удалить услугу',                   'Delete service',                 'services'),
  ('services.status_forward',         'Перевести статус вперёд',          'Move status forward',            'services'),
  ('services.status_backward',        'Перевести статус назад',           'Move status backward',           'services'),
  ('services.status_backward_post_pay','Вернуть статус после оплаты',     'Revert status after payment',    'services'),
  -- Invoices
  ('invoices.add',                    'Создать счёт',                     'Create invoice',                 'invoices'),
  ('invoices.edit',                   'Редактировать счёт',               'Edit invoice',                   'invoices'),
  ('invoices.cancel',                 'Отменить счёт',                    'Cancel invoice',                 'invoices'),
  -- Payments
  ('payments.receive',                'Принять оплату',                   'Receive payment',                'payments'),
  ('payments.refund_request',         'Запросить возврат',                'Request refund',                 'payments'),
  ('payments.refund_approve',         'Утвердить возврат',                'Approve refund',                 'payments'),
  -- Documents
  ('documents.create',                'Создать документ',                 'Create document',                'documents'),
  ('documents.edit',                  'Редактировать документ',           'Edit document',                  'documents'),
  ('documents.complete',              'Завершить документ',               'Complete document',              'documents'),
  ('documents.edit_after_window',     'Редактировать после окна',         'Edit after time window',         'documents'),
  -- Prescriptions
  ('prescriptions.create',            'Создать назначение',               'Create prescription',            'prescriptions'),
  ('prescriptions.cancel',            'Отменить назначение',              'Cancel prescription',            'prescriptions'),
  -- Hospitalizations
  ('hospitalizations.open',           'Открыть госпитализацию',           'Open hospitalization',           'hospitalizations'),
  ('hospitalizations.discharge',      'Выписать пациента',                'Discharge patient',              'hospitalizations'),
  ('hospitalizations.assign_room',    'Назначить палату',                 'Assign room',                    'hospitalizations'),
  -- Schedules
  ('schedules.manage',                'Управлять расписанием',            'Manage schedules',               'schedules'),
  ('schedules.block',                 'Блокировать расписание',           'Block schedule',                 'schedules'),
  -- Warehouse
  ('warehouse.receive_incoming',      'Принять товар',                    'Receive incoming stock',         'warehouse'),
  ('warehouse.transfer_send',         'Отправить перемещение',            'Send transfer',                  'warehouse'),
  ('warehouse.transfer_accept',       'Принять перемещение',              'Accept transfer',                'warehouse'),
  ('warehouse.writeoff',              'Списание',                         'Write off stock',                'warehouse'),
  ('warehouse.view_all',              'Просмотр всех складов',            'View all warehouses',            'warehouse'),
  -- Finance
  ('finance.view_payroll',            'Просмотр зарплаты',                'View payroll',                   'finance'),
  ('finance.confirm_payroll',         'Подтвердить зарплату',             'Confirm payroll',                'finance'),
  -- System
  ('system.manage_settings',          'Управлять настройками',            'Manage settings',                'system'),
  ('system.manage_users',             'Управлять пользователями',         'Manage users',                   'system'),
  ('system.manage_services',          'Управлять каталогом услуг',        'Manage service catalog',         'system'),
  ('system.manage_document_templates','Управлять шаблонами документов',   'Manage document templates',      'system');

  -- Part 3: Role Permissions (default matrix)

CREATE TABLE public.role_permissions (
  role_id       uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Helper function to insert role permissions by code
CREATE OR REPLACE FUNCTION seed_role_permission(p_role_code text, p_permission_code text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM public.roles r, public.permissions p
  WHERE r.code = p_role_code
    AND p.code = p_permission_code
  ON CONFLICT DO NOTHING;
$$;

-- Admin gets everything
SELECT seed_role_permission('admin', code) FROM public.permissions;

-- Outpatient Registrar
SELECT seed_role_permission('outpatient_registrar', 'patients.add');
SELECT seed_role_permission('outpatient_registrar', 'patients.edit');
SELECT seed_role_permission('outpatient_registrar', 'patients.view_all');
SELECT seed_role_permission('outpatient_registrar', 'services.add');
SELECT seed_role_permission('outpatient_registrar', 'services.status_forward');
SELECT seed_role_permission('outpatient_registrar', 'services.status_backward');
SELECT seed_role_permission('outpatient_registrar', 'invoices.add');
SELECT seed_role_permission('outpatient_registrar', 'invoices.cancel');
SELECT seed_role_permission('outpatient_registrar', 'payments.refund_request');

-- Call Center Registrar
SELECT seed_role_permission('call_center_registrar', 'patients.add');
SELECT seed_role_permission('call_center_registrar', 'patients.edit');
SELECT seed_role_permission('call_center_registrar', 'services.add');

-- Inpatient Registrar
SELECT seed_role_permission('inpatient_registrar', 'patients.add');
SELECT seed_role_permission('inpatient_registrar', 'patients.edit');
SELECT seed_role_permission('inpatient_registrar', 'patients.view_all');
SELECT seed_role_permission('inpatient_registrar', 'hospitalizations.open');
SELECT seed_role_permission('inpatient_registrar', 'hospitalizations.discharge');

-- Cashier
SELECT seed_role_permission('cashier', 'patients.view_all');
SELECT seed_role_permission('cashier', 'payments.receive');
SELECT seed_role_permission('cashier', 'payments.refund_request');
SELECT seed_role_permission('cashier', 'invoices.cancel');

-- Physician
SELECT seed_role_permission('physician', 'patients.view_all');
SELECT seed_role_permission('physician', 'services.add');
SELECT seed_role_permission('physician', 'services.status_forward');
SELECT seed_role_permission('physician', 'documents.create');
SELECT seed_role_permission('physician', 'documents.edit');
SELECT seed_role_permission('physician', 'documents.complete');
SELECT seed_role_permission('physician', 'prescriptions.create');
SELECT seed_role_permission('physician', 'prescriptions.cancel');
SELECT seed_role_permission('physician', 'hospitalizations.open');
SELECT seed_role_permission('physician', 'hospitalizations.discharge');

-- Functional Diagnostics Physician
SELECT seed_role_permission('functional_diagnostics_physician', 'patients.view_all');
SELECT seed_role_permission('functional_diagnostics_physician', 'services.status_forward');
SELECT seed_role_permission('functional_diagnostics_physician', 'documents.create');
SELECT seed_role_permission('functional_diagnostics_physician', 'documents.edit');
SELECT seed_role_permission('functional_diagnostics_physician', 'documents.complete');

-- Lab Physician
SELECT seed_role_permission('lab_physician', 'patients.view_all');
SELECT seed_role_permission('lab_physician', 'services.status_forward');

-- Blood Draw Nurse
SELECT seed_role_permission('blood_draw_nurse', 'patients.view_all');
SELECT seed_role_permission('blood_draw_nurse', 'services.status_forward');

-- Inpatient Nurse
SELECT seed_role_permission('inpatient_nurse', 'patients.view_all');
SELECT seed_role_permission('inpatient_nurse', 'services.status_forward');
SELECT seed_role_permission('inpatient_nurse', 'documents.create');
SELECT seed_role_permission('inpatient_nurse', 'documents.complete');
SELECT seed_role_permission('inpatient_nurse', 'hospitalizations.assign_room');
SELECT seed_role_permission('inpatient_nurse', 'warehouse.transfer_accept');

-- Head Nurse
SELECT seed_role_permission('head_nurse', 'patients.view_all');
SELECT seed_role_permission('head_nurse', 'services.status_forward');
SELECT seed_role_permission('head_nurse', 'documents.create');
SELECT seed_role_permission('head_nurse', 'documents.complete');
SELECT seed_role_permission('head_nurse', 'hospitalizations.assign_room');
SELECT seed_role_permission('head_nurse', 'warehouse.transfer_accept');
SELECT seed_role_permission('head_nurse', 'warehouse.writeoff');
SELECT seed_role_permission('head_nurse', 'warehouse.view_all');

-- Senior Manager
SELECT seed_role_permission('senior_manager', 'patients.view_all');
SELECT seed_role_permission('senior_manager', 'payments.refund_approve');
SELECT seed_role_permission('senior_manager', 'services.status_backward_post_pay');
SELECT seed_role_permission('senior_manager', 'finance.view_payroll');

-- HR
SELECT seed_role_permission('hr', 'patients.view_all');
SELECT seed_role_permission('hr', 'schedules.manage');
SELECT seed_role_permission('hr', 'schedules.block');
SELECT seed_role_permission('hr', 'system.manage_users');

-- Finance
SELECT seed_role_permission('finance', 'patients.view_all');
SELECT seed_role_permission('finance', 'finance.view_payroll');
SELECT seed_role_permission('finance', 'finance.confirm_payroll');
SELECT seed_role_permission('finance', 'documents.edit_after_window');

-- Pharmacist
SELECT seed_role_permission('pharmacist', 'patients.view_all');
SELECT seed_role_permission('pharmacist', 'warehouse.receive_incoming');
SELECT seed_role_permission('pharmacist', 'warehouse.transfer_send');
SELECT seed_role_permission('pharmacist', 'warehouse.writeoff');
SELECT seed_role_permission('pharmacist', 'warehouse.view_all');

-- Warehouse Staff
SELECT seed_role_permission('warehouse_staff', 'warehouse.receive_incoming');
SELECT seed_role_permission('warehouse_staff', 'warehouse.transfer_send');
SELECT seed_role_permission('warehouse_staff', 'warehouse.writeoff');
SELECT seed_role_permission('warehouse_staff', 'warehouse.view_all');

-- Inventory Manager
SELECT seed_role_permission('inventory_manager', 'warehouse.view_all');

-- Radiology Technician
SELECT seed_role_permission('radiology_technician', 'patients.view_all');
SELECT seed_role_permission('radiology_technician', 'services.status_forward');
SELECT seed_role_permission('radiology_technician', 'documents.create');
SELECT seed_role_permission('radiology_technician', 'documents.complete');

-- Drop helper function after use
DROP FUNCTION seed_role_permission(text, text);

-- Part 4: Service Statuses and Status Transitions

CREATE TABLE public.service_statuses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0,
  is_active  boolean DEFAULT true
);

INSERT INTO public.service_statuses (code, name_ru, name_en, sort_order) VALUES
  ('reservation',          'Бронь',                  'Reservation',          1),
  ('preliminary',          'Предварительное',         'Preliminary',          2),
  ('ready_for_execution',  'Готов к исполнению',      'Ready for Execution',  3),
  ('in_progress',          'В процессе',              'In Progress',          4),
  ('completed',            'Выполнен',                'Completed',            5),
  ('cancelled',            'Отменён',                 'Cancelled',            6);

CREATE TABLE public.status_transitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_status_id      uuid REFERENCES public.service_statuses(id),
  to_status_id        uuid NOT NULL REFERENCES public.service_statuses(id),
  allowed_role_codes  text[] NOT NULL,
  condition_code      text,
  service_type_code   text,
  sort_order          int DEFAULT 0
);

-- Helper to insert transitions by code
CREATE OR REPLACE FUNCTION seed_transition(
  p_from text,
  p_to text,
  p_roles text[],
  p_condition text DEFAULT NULL,
  p_service_type text DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.status_transitions 
    (from_status_id, to_status_id, allowed_role_codes, condition_code, service_type_code)
  SELECT 
    f.id, t.id, p_roles, p_condition, p_service_type
  FROM public.service_statuses f, public.service_statuses t
  WHERE f.code = p_from AND t.code = p_to;
$$;

-- General services: call center creates reservation
SELECT seed_transition('reservation', 'ready_for_execution',
  ARRAY['outpatient_registrar', 'cashier'], 'after_payment');

-- Registrar creates preliminary
SELECT seed_transition('preliminary', 'ready_for_execution',
  ARRAY['outpatient_registrar', 'cashier', 'admin'], 'after_payment');

-- Registrar can cancel before payment
SELECT seed_transition('preliminary', 'cancelled',
  ARRAY['outpatient_registrar', 'admin'], 'before_payment');

-- Physician completes
SELECT seed_transition('ready_for_execution', 'completed',
  ARRAY['physician', 'functional_diagnostics_physician', 
        'lab_physician', 'radiology_technician', 'admin']);

-- Senior cashier reverts after payment
SELECT seed_transition('ready_for_execution', 'preliminary',
  ARRAY['senior_manager', 'admin'], 'after_payment');

-- Lab: nurse moves to in_progress after blood draw
SELECT seed_transition('ready_for_execution', 'in_progress',
  ARRAY['blood_draw_nurse', 'inpatient_nurse', 'admin']);

-- Lab physician completes from in_progress
SELECT seed_transition('in_progress', 'completed',
  ARRAY['lab_physician', 'admin']);

-- Inpatient physician opens directly at ready_for_execution
SELECT seed_transition('preliminary', 'ready_for_execution',
  ARRAY['physician', 'admin'], 'inpatient_only');

DROP FUNCTION seed_transition(text, text, text[], text, text);

-- Part 5: Remaining Lookup Tables

-- Payment Methods
CREATE TABLE public.payment_methods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0,
  is_active  boolean DEFAULT true
);

INSERT INTO public.payment_methods (code, name_ru, name_en, sort_order) VALUES
  ('cash',           'Наличные',          'Cash',           1),
  ('card',           'Банковская карта',   'Card',           2),
  ('bank_transfer',  'Банковский перевод', 'Bank Transfer',  3),
  ('insurance',      'Страховка',          'Insurance',      4),
  ('other',          'Другое',             'Other',          5);

-- Routes of Administration
CREATE TABLE public.routes_of_administration (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0,
  is_active  boolean DEFAULT true
);

INSERT INTO public.routes_of_administration (code, name_ru, name_en, sort_order) VALUES
  ('iv_bolus',        'Внутривенно болюсно',    'IV Bolus',           1),
  ('iv_drip',         'Внутривенно капельно',   'IV Drip',            2),
  ('oral',            'Перорально',              'Oral',               3),
  ('im',              'Внутримышечно',           'Intramuscular',      4),
  ('sc',              'Подкожно',                'Subcutaneous',       5),
  ('rectal',          'Ректально',               'Rectal',             6),
  ('nasal',           'Назально',                'Nasal',              7),
  ('sublingual',      'Подъязычно',              'Sublingual',         8),
  ('ear',             'В ухо',                   'Ear',                9),
  ('eye',             'В глаз',                  'Eye',               10),
  ('vaginal',         'Вагинально',              'Vaginal',           11),
  ('epidural',        'Эпидурально',             'Epidural',          12),
  ('transdermal',     'Трансдермально',          'Transdermal',       13),
  ('intrathecal',     'Интратекально',           'Intrathecal',       14),
  ('intraosseous',    'Внутрикостно',            'Intraosseous',      15),
  ('endotracheal',    'Эндотрахеально',          'Endotracheal',      16),
  ('nasogastric',     'Назогастрально',          'Nasogastric',       17),
  ('intradermal',     'Внутрикожно',             'Intradermal',       18),
  ('inhalation',      'Ингаляционно',            'Inhalation',        19),
  ('other',           'Другое',                  'Other',             20);

-- Administration Rules
CREATE TABLE public.administration_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.administration_rules (code, name_ru, name_en, sort_order) VALUES
  ('any_time',      'В любое время',    'Any time',         1),
  ('before_food',   'До еды',           'Before food',      2),
  ('during_food',   'Во время еды',     'During food',      3),
  ('after_food',    'После еды',        'After food',       4),
  ('on_empty',      'Натощак',          'On empty stomach', 5),
  ('before_sleep',  'Перед сном',       'Before sleep',     6);

-- Medication Order Statuses
CREATE TABLE public.medication_order_statuses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.medication_order_statuses (code, name_ru, name_en, sort_order) VALUES
  ('preliminary',         'Предварительное',      'Preliminary',          1),
  ('in_progress',         'В процессе',           'In Progress',          2),
  ('ready_for_execution', 'Готов к исполнению',   'Ready for Execution',  3),
  ('completed',           'Выполнен',             'Completed',            4),
  ('cancelled',           'Отменён',              'Cancelled',            5),
  ('return',              'Возврат',              'Return',               6),
  ('returned_accepted',   'Обратно принято',      'Returned Accepted',    7);

-- Units of Measurement
CREATE TABLE public.units_of_measurement (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,
  name_ru      text NOT NULL,
  name_en      text NOT NULL,
  abbreviation text,
  sort_order   int DEFAULT 0
);

INSERT INTO public.units_of_measurement (code, name_ru, name_en, abbreviation, sort_order) VALUES
  ('ml',      'Миллилитр',      'Milliliter',       'мл',   1),
  ('l',       'Литр',           'Liter',            'л',    2),
  ('mg',      'Милliграмм',     'Milligram',        'мг',   3),
  ('g',       'Грамм',          'Gram',             'г',    4),
  ('kg',      'Килограмм',      'Kilogram',         'кг',   5),
  ('mcg',     'Микрограмм',     'Microgram',        'мкг',  6),
  ('iu',      'МЕ',             'International Unit','МЕ',  7),
  ('pcs',     'Штука',          'Piece',            'шт',   8),
  ('tab',     'Таблетка',       'Tablet',           'таб',  9),
  ('amp',     'Ампула',         'Ampoule',          'амп', 10),
  ('vial',    'Флакон',         'Vial',             'фл',  11),
  ('pack',    'Упаковка',       'Package',          'уп',  12),
  ('roll',    'Рулон',          'Roll',             'рул', 13),
  ('pair',    'Пара',           'Pair',             'пар', 14),
  ('mmhg',    'мм рт. ст.',     'mmHg',             'мм рт.ст.', 15),
  ('percent', 'Процент',        'Percent',          '%',   16),
  ('drops',   'Капли',          'Drops',            'кап', 17),
  ('dose',    'Доза',           'Dose',             'доз', 18),
  ('m',       'Метр',           'Meter',            'м',   19),
  ('cm',      'Сантиметр',      'Centimeter',       'см',  20);

-- Release Forms
CREATE TABLE public.release_forms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.release_forms (code, name_ru, name_en, sort_order) VALUES
  ('tablet',          'Таблетка',         'Tablet',           1),
  ('capsule',         'Капсула',          'Capsule',          2),
  ('ampoule',         'Ампула',           'Ampoule',          3),
  ('vial',            'Флакон',           'Vial',             4),
  ('solution',        'Раствор',          'Solution',         5),
  ('suspension',      'Суспензия',        'Suspension',       6),
  ('syrup',           'Сироп',            'Syrup',            7),
  ('powder',          'Порошок',          'Powder',           8),
  ('granules',        'Гранулы',          'Granules',         9),
  ('spray',           'Спрей',            'Spray',           10),
  ('cream',           'Крем',             'Cream',           11),
  ('gel',             'Гель',             'Gel',             12),
  ('ointment',        'Мазь',             'Ointment',        13),
  ('drops',           'Капли',            'Drops',           14),
  ('suppository',     'Суппозиторий',     'Suppository',     15),
  ('patch',           'Пластырь',         'Patch',           16),
  ('tincture',        'Настойка',         'Tincture',        17),
  ('paste',           'Паста',            'Paste',           18),
  ('prefilled_syringe','Преднаполненный шприц','Prefilled Syringe',19),
  ('bag',             'Пакет',            'Bag',             20);

-- Packaging Types
CREATE TABLE public.packaging_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.packaging_types (code, name_ru, name_en, sort_order) VALUES
  ('package',          'Упаковка',          'Package',           1),
  ('box',              'Коробка',           'Box',               2),
  ('carton',           'Картонная коробка', 'Carton',            3),
  ('bottle',           'Бутылка',           'Bottle',            4),
  ('vial',             'Флакон',            'Vial',              5),
  ('tube',             'Туба',              'Tube',              6),
  ('bag',              'Пакет',             'Bag',               7),
  ('roll',             'Рулон',             'Roll',              8),
  ('prefilled_syringe','Преднаполненный шприц','Prefilled Syringe',9),
  ('cartridge',        'Картридж',          'Cartridge',        10);

-- Product Types
CREATE TABLE public.product_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.product_types (code, name_ru, name_en, sort_order) VALUES
  ('medications',      'Медикаменты',    'Medications',       1),
  ('medical_supplies', 'ИМН',            'Medical Supplies',  2),
  ('household',        'Хозтовары',      'Household Goods',   3),
  ('food',             'Продукты',       'Food Products',     4);

-- Warehouse Types
CREATE TABLE public.warehouse_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.warehouse_types (code, name_ru, name_en, sort_order) VALUES
  ('central_pharmacy', 'Центральная аптека',  'Central Pharmacy',   1),
  ('general',          'Общий склад',         'General Warehouse',  2),
  ('department',       'Склад отделения',     'Department Warehouse',3);

-- Write-off Types
CREATE TABLE public.write_off_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.write_off_types (code, name_ru, name_en, sort_order) VALUES
  ('act',              'Акт списания',        'Write-off Act',         1),
  ('employee',         'На сотрудника',       'Employee Charge',       2),
  ('return_supplier',  'Возврат поставщику',  'Return to Supplier',    3);

-- Hospitalization Types
CREATE TABLE public.hospitalization_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.hospitalization_types (code, name_ru, name_en, sort_order) VALUES
  ('ambulatory', 'Амбулаторная', 'Ambulatory', 1),
  ('inpatient',  'Стационарная', 'Inpatient',  2);

-- Hospitalization Urgency
CREATE TABLE public.hospitalization_urgency (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.hospitalization_urgency (code, name_ru, name_en, sort_order) VALUES
  ('planned',    'Плановая',   'Planned',    1),
  ('emergency',  'Экстренная', 'Emergency',  2);

-- Anesthesia Types
CREATE TABLE public.anesthesia_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.anesthesia_types (code, name_ru, name_en, sort_order) VALUES
  ('combined_general',        'Комбинированный общий',         'Combined General',          1),
  ('general',                 'Общий',                         'General',                   2),
  ('spinal',                  'Спинальный',                    'Spinal',                    3),
  ('epidural',                'Эпидуральный',                  'Epidural',                  4),
  ('local',                   'Местный',                       'Local',                     5),
  ('regional',                'Региональный',                  'Regional',                  6),
  ('total_intravenous',       'Тотальный внутривенный',        'Total Intravenous',         7),
  ('monitored_care',          'Мониторируемая анестезия',      'Monitored Anesthesia Care', 8),
  ('inhalational',            'Ингаляционный',                 'Inhalational',              9),
  ('conductive',              'Проводниковый',                 'Conductive',               10);

-- Diet Types
CREATE TABLE public.diet_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.diet_types (code, name_ru, name_en, sort_order) VALUES
  ('n0',  'Диета №0',  'Diet No.0',  0),
  ('n1',  'Диета №1',  'Diet No.1',  1),
  ('n2',  'Диета №2',  'Diet No.2',  2),
  ('n3',  'Диета №3',  'Diet No.3',  3),
  ('n4',  'Диета №4',  'Diet No.4',  4),
  ('n5',  'Диета №5',  'Diet No.5',  5),
  ('n6',  'Диета №6',  'Diet No.6',  6),
  ('n7',  'Диета №7',  'Diet No.7',  7),
  ('n8',  'Диета №8',  'Diet No.8',  8),
  ('n9',  'Диета №9',  'Diet No.9',  9),
  ('n10', 'Диета №10', 'Diet No.10', 10),
  ('n11', 'Диета №11', 'Diet No.11', 11),
  ('n12', 'Диета №12', 'Diet No.12', 12),
  ('n13', 'Диета №13', 'Diet No.13', 13),
  ('n14', 'Диета №14', 'Diet No.14', 14),
  ('n15', 'Диета №15', 'Diet No.15', 15);

-- Activity Modes
CREATE TABLE public.activity_modes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.activity_modes (code, name_ru, name_en, sort_order) VALUES
  ('strict_bed_rest', 'Строгий постельный режим', 'Strict Bed Rest',  1),
  ('ward_mode',       'Палатный режим',            'Ward Mode',        2),
  ('general_mode',    'Общий режим',               'General Mode',     3);
  
  -- Part 6: Document Group Types

CREATE TABLE public.document_group_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name_ru    text NOT NULL,
  name_en    text NOT NULL,
  sort_order int DEFAULT 0
);

INSERT INTO public.document_group_types (code, name_ru, name_en, sort_order) VALUES
  ('clinical',    'Клинические',      'Clinical',    1),
  ('diagnostic',  'Диагностические',  'Diagnostic',  2),
  ('surgical',    'Хирургические',    'Surgical',    3),
  ('nursing',     'Сестринские',      'Nursing',     4),
  ('assessment',  'Оценочные',        'Assessment',  5);
