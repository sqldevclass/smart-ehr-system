-- Migration 134: Seed diagnosis_scale_mappings
-- Source: Шкалы для диагнозов new.xlsx
--
-- Only ICD-10 codes confirmed to exist in icd10_codes table are used
-- as icd10_code FK values. icd10_range_end is plain text (no FK).
-- Rows with no ICD-10 code stored with icd10_code = NULL.

DO $$
DECLARE
  s_cha2ds2        uuid := (SELECT id FROM clinical_scales WHERE code = 'cha2ds2_vasc');
  s_has_bled       uuid := (SELECT id FROM clinical_scales WHERE code = 'has_bled');
  s_ehra           uuid := (SELECT id FROM clinical_scales WHERE code = 'ehra');
  s_score2         uuid := (SELECT id FROM clinical_scales WHERE code = 'score2');
  s_nyha           uuid := (SELECT id FROM clinical_scales WHERE code = 'nyha');
  s_grace          uuid := (SELECT id FROM clinical_scales WHERE code = 'grace');
  s_timi           uuid := (SELECT id FROM clinical_scales WHERE code = 'timi');
  s_wells_pe       uuid := (SELECT id FROM clinical_scales WHERE code = 'wells_pe');
  s_wells_dvt      uuid := (SELECT id FROM clinical_scales WHERE code = 'wells_dvt');
  s_hfa_peff       uuid := (SELECT id FROM clinical_scales WHERE code = 'hfa_peff');
  s_h2fpef         uuid := (SELECT id FROM clinical_scales WHERE code = 'h2fpef');
  s_syntax         uuid := (SELECT id FROM clinical_scales WHERE code = 'syntax');
  s_nihss          uuid := (SELECT id FROM clinical_scales WHERE code = 'nihss');
  s_abcd2          uuid := (SELECT id FROM clinical_scales WHERE code = 'abcd2');
  s_mrs            uuid := (SELECT id FROM clinical_scales WHERE code = 'mrs');
  s_moca           uuid := (SELECT id FROM clinical_scales WHERE code = 'moca');
  s_mmse           uuid := (SELECT id FROM clinical_scales WHERE code = 'mmse');
  s_updrs          uuid := (SELECT id FROM clinical_scales WHERE code = 'updrs');
  s_edss           uuid := (SELECT id FROM clinical_scales WHERE code = 'edss');
  s_phq9           uuid := (SELECT id FROM clinical_scales WHERE code = 'phq9');
  s_gad7           uuid := (SELECT id FROM clinical_scales WHERE code = 'gad7');
  s_hads           uuid := (SELECT id FROM clinical_scales WHERE code = 'hads');
  s_isi            uuid := (SELECT id FROM clinical_scales WHERE code = 'isi');
  s_epworth        uuid := (SELECT id FROM clinical_scales WHERE code = 'epworth');
  s_cat            uuid := (SELECT id FROM clinical_scales WHERE code = 'cat');
  s_mmrc           uuid := (SELECT id FROM clinical_scales WHERE code = 'mmrc');
  s_act            uuid := (SELECT id FROM clinical_scales WHERE code = 'act');
  s_curb65         uuid := (SELECT id FROM clinical_scales WHERE code = 'curb65');
  s_stop_bang      uuid := (SELECT id FROM clinical_scales WHERE code = 'stop_bang');
  s_findrisc       uuid := (SELECT id FROM clinical_scales WHERE code = 'findrisc');
  s_bmi_waist      uuid := (SELECT id FROM clinical_scales WHERE code = 'bmi_waist');
  s_eoss           uuid := (SELECT id FROM clinical_scales WHERE code = 'eoss');
  s_ata            uuid := (SELECT id FROM clinical_scales WHERE code = 'ata');
  s_frax           uuid := (SELECT id FROM clinical_scales WHERE code = 'frax');
  s_child_pugh     uuid := (SELECT id FROM clinical_scales WHERE code = 'child_pugh');
  s_meld_na        uuid := (SELECT id FROM clinical_scales WHERE code = 'meld_na');
  s_glasgow_bl     uuid := (SELECT id FROM clinical_scales WHERE code = 'glasgow_blatchford');
  s_gerd_q         uuid := (SELECT id FROM clinical_scales WHERE code = 'gerd_q');
  s_ranson         uuid := (SELECT id FROM clinical_scales WHERE code = 'ranson');
  s_mayo_uc        uuid := (SELECT id FROM clinical_scales WHERE code = 'mayo_uc');
  s_cdai           uuid := (SELECT id FROM clinical_scales WHERE code = 'cdai');
  s_kdigo          uuid := (SELECT id FROM clinical_scales WHERE code = 'kdigo');
  s_kfre           uuid := (SELECT id FROM clinical_scales WHERE code = 'kfre');
  s_das28          uuid := (SELECT id FROM clinical_scales WHERE code = 'das28');
  s_basdai         uuid := (SELECT id FROM clinical_scales WHERE code = 'basdai');
  s_sledai         uuid := (SELECT id FROM clinical_scales WHERE code = 'sledai');
  s_qsofa          uuid := (SELECT id FROM clinical_scales WHERE code = 'qsofa');
  s_sofa           uuid := (SELECT id FROM clinical_scales WHERE code = 'sofa');
  s_apache2        uuid := (SELECT id FROM clinical_scales WHERE code = 'apache2');
  s_4t             uuid := (SELECT id FROM clinical_scales WHERE code = '4t_score');
  s_khorana        uuid := (SELECT id FROM clinical_scales WHERE code = 'khorana');
  s_ipss_r         uuid := (SELECT id FROM clinical_scales WHERE code = 'ipss_r');
  s_ecog           uuid := (SELECT id FROM clinical_scales WHERE code = 'ecog');
  s_karnofsky      uuid := (SELECT id FROM clinical_scales WHERE code = 'karnofsky');
  s_tnm            uuid := (SELECT id FROM clinical_scales WHERE code = 'tnm');
  s_imdc           uuid := (SELECT id FROM clinical_scales WHERE code = 'imdc');
  s_cfs            uuid := (SELECT id FROM clinical_scales WHERE code = 'cfs');
  s_barthel        uuid := (SELECT id FROM clinical_scales WHERE code = 'barthel');
  s_gds            uuid := (SELECT id FROM clinical_scales WHERE code = 'gds');
  s_ipss           uuid := (SELECT id FROM clinical_scales WHERE code = 'ipss');
  s_iief5          uuid := (SELECT id FROM clinical_scales WHERE code = 'iief5');
  s_nih_cpsi       uuid := (SELECT id FROM clinical_scales WHERE code = 'nih_cpsi');
  s_iciq           uuid := (SELECT id FROM clinical_scales WHERE code = 'iciq');
  s_capra          uuid := (SELECT id FROM clinical_scales WHERE code = 'capra');
  s_damico         uuid := (SELECT id FROM clinical_scales WHERE code = 'damico');
  s_eortc          uuid := (SELECT id FROM clinical_scales WHERE code = 'eortc');
  s_popq           uuid := (SELECT id FROM clinical_scales WHERE code = 'popq');
  s_dvss           uuid := (SELECT id FROM clinical_scales WHERE code = 'dvss');
  s_nakata         uuid := (SELECT id FROM clinical_scales WHERE code = 'nakata');
  s_mcgoon         uuid := (SELECT id FROM clinical_scales WHERE code = 'mcgoon');
BEGIN

INSERT INTO public.diagnosis_scale_mappings
  (icd10_code, icd10_range_end, scale_id, purpose, sort_order)
VALUES
-- Фибрилляция предсердий I48
('I48', NULL, s_cha2ds2,   'Риск инсульта → нужна ли антикоагуляция', 1),
('I48', NULL, s_has_bled,  'Риск кровотечений на антикоагулянтах', 2),
('I48', NULL, s_ehra,      'Тяжесть симптомов → контроль ритма/ЧСС', 3),

-- Артериальная гипертензия I10
('I10', NULL, s_score2,    'Общий сердечно-сосудистый риск', 1),

-- Сердечная недостаточность I50
-- (I50.3 does not exist in icd10_codes — using I50 for HFpEF scales too)
('I50', NULL, s_nyha,      'Функциональный класс, тяжесть', 1),
('I50', NULL, s_hfa_peff,  'Диагностика HFpEF', 2),
('I50', NULL, s_h2fpef,    'Диагностика HFpEF (альтернативная)', 3),

-- ИБС / ОКС — no ICD-10 in source file
(NULL, NULL, s_grace,      'Риск осложнений, маршрутизация', 1),
(NULL, NULL, s_timi,       'Риск при ОКС', 2),
(NULL, NULL, s_syntax,     'Выбор ЧКВ или АКШ', 3),

-- Подозрение на ТЭЛА I26
('I26', NULL, s_wells_pe,  'Вероятность ТЭЛА → D-димер/КТ', 1),

-- Подозрение на ТГВ I80
('I80', NULL, s_wells_dvt, 'Вероятность ТГВ', 1),

-- Инсульт I63, I61, I64
('I63', NULL, s_nihss,     'Тяжесть, срочность', 1),
('I61', NULL, s_nihss,     'Тяжесть, срочность', 1),
('I64', NULL, s_nihss,     'Тяжесть, срочность', 1),

-- ТИА G45
('G45', NULL, s_abcd2,     'Риск инсульта в ближайшие дни', 1),

-- Последствия инсульта I69
('I69', NULL, s_mrs,       'Степень инвалидизации', 1),

-- Жалобы на память — no ICD-10
(NULL, NULL, s_moca,       'Ранние когнитивные нарушения', 1),

-- Деменция — only F03 exists in icd10_codes (F00, F01, F02 do not)
('F03', NULL, s_mmse,      'Скрининг и динамика деменции', 1),

-- Болезнь Паркинсона G20
('G20', NULL, s_updrs,     'Тяжесть болезни Паркинсона', 1),

-- Рассеянный склероз G35
('G35', NULL, s_edss,      'Инвалидизация при РС', 1),

-- Депрессия F32, F33
('F32', NULL, s_phq9,      'Скрининг + тяжесть', 1),
('F33', NULL, s_phq9,      'Скрининг + тяжесть', 1),

-- Тревога F41.1
('F41.1', NULL, s_gad7,    'Степень тревожности', 1),

-- Смешанные тревога/депрессия — no ICD-10
(NULL, NULL, s_hads,       'У соматических пациентов', 1),

-- Бессонница G47.0
('G47.0', NULL, s_isi,     'Тяжесть инсомнии', 1),

-- Дневная сонливость — no ICD-10
(NULL, NULL, s_epworth,    'Подозрение на СОАС', 1),

-- ХОБЛ J44
('J44', NULL, s_cat,       'Симптомы, контроль', 1),
('J44', NULL, s_mmrc,      'Одышка', 2),

-- Бронхиальная астма J45
('J45', NULL, s_act,       'Контроль астмы', 1),

-- Пневмония J18
('J18', NULL, s_curb65,    'Амбулаторно vs госпитализация', 1),

-- Апноэ сна G47.3
('G47.3', NULL, s_stop_bang, 'Кого отправлять на полисомнографию', 1),

-- Скрининг СД Z13.1
('Z13.1', NULL, s_findrisc, 'Скрининг риска СД2', 1),

-- Ожирение E66
('E66', NULL, s_bmi_waist, 'Кардиометаболический риск', 1),
('E66', NULL, s_eoss,      'Стадирование ожирения', 2),

-- Диабетическая стопа E10.5–E14.5 (range; both endpoints exist in icd10_codes)
('E10.5', 'E14.5', s_findrisc, 'Скрининг риска — диабетические осложнения', 1),

-- Рак щитовидной железы — no ICD-10
(NULL, NULL, s_ata,        'Стратификация риска', 1),

-- Риск переломов — no ICD-10
(NULL, NULL, s_frax,       'Риск переломов', 1),

-- Цирроз K74
('K74', NULL, s_child_pugh, 'Тяжесть и прогноз', 1),
('K74', NULL, s_meld_na,   'Прогноз, трансплантация', 2),

-- ЖКК K92.2
('K92.2', NULL, s_glasgow_bl, 'Риск, необходимость госпитализации', 1),

-- ГЭРБ K21
('K21', NULL, s_gerd_q,    'Вероятность ГЭРБ', 1),

-- Панкреатит K85
('K85', NULL, s_ranson,    'Тяжесть острого панкреатита', 1),

-- Язвенный колит K51
('K51', NULL, s_mayo_uc,   'Активность язвенного колита', 1),

-- Болезнь Крона K50
('K50', NULL, s_cdai,      'Активность болезни Крона', 1),

-- ХБП N18
('N18', NULL, s_kdigo,     'Стадия и риск', 1),
('N18', NULL, s_kfre,      'Риск прогрессирования до диализа', 2),

-- Ревматоидный артрит M05, M06
('M05', NULL, s_das28,     'Активность заболевания', 1),
('M06', NULL, s_das28,     'Активность заболевания', 1),

-- Анкилозирующий спондилит M45
('M45', NULL, s_basdai,    'Активность', 1),

-- СКВ M32
('M32', NULL, s_sledai,    'Активность СКВ', 1),

-- Сепсис A41
('A41', NULL, s_qsofa,     'Быстрый скрининг', 1),

-- Тяжёлый пациент — no ICD-10
(NULL, NULL, s_sofa,       'Органная дисфункция', 1),
(NULL, NULL, s_apache2,    'Тяжесть в ОРИТ', 2),

-- ГИТ D75.8
('D75.8', NULL, s_4t,      'Гепарин-индуцированная тромбоцитопения', 1),

-- Тромбозы у онкобольных — no ICD-10
(NULL, NULL, s_khorana,    'Риск тромбозов у онкобольных', 1),

-- МДС D46
('D46', NULL, s_ipss_r,    'Прогноз МДС', 1),

-- Функциональный статус — no ICD-10
(NULL, NULL, s_ecog,       'Функциональный статус онкобольного', 1),
(NULL, NULL, s_karnofsky,  'Функциональный статус', 2),
(NULL, NULL, s_tnm,        'Стадирование опухолей', 3),

-- Метастатический рак почки — no ICD-10
(NULL, NULL, s_imdc,       'Прогноз метастатического рака почки', 1),

-- Пожилой пациент — no ICD-10
(NULL, NULL, s_cfs,        'Хрупкость', 1),
(NULL, NULL, s_barthel,    'Функциональность', 2),
(NULL, NULL, s_gds,        'Депрессия у пожилых', 3),

-- ДГПЖ N40
('N40', NULL, s_ipss,      'Тяжесть симптомов ДГПЖ', 1),

-- Эректильная дисфункция — N52 does not exist in icd10_codes, skipped
-- IIEF-5 available as manually-added scale only

-- Хронический простатит N41.1
('N41.1', NULL, s_nih_cpsi, 'Симптомы и динамика', 1),

-- Недержание мочи R32, N39.3, N39.4
('R32',   NULL, s_iciq,    'Тяжесть недержания', 1),
('N39.3', NULL, s_iciq,    'Тяжесть недержания', 1),
('N39.4', NULL, s_iciq,    'Тяжесть недержания', 1),

-- Рак простаты C61
('C61', NULL, s_capra,     'Прогноз после лечения', 1),
('C61', NULL, s_damico,    'Классификация риска', 2),

-- Рак мочевого пузыря C67
('C67', NULL, s_eortc,     'Риск рецидива и прогрессирования', 1),

-- Пролапс тазовых органов N81
('N81', NULL, s_popq,      'Стадирование пролапса', 1),

-- Нарушения мочеиспускания N39.8
('N39.8', NULL, s_dvss,    'Дисфункциональное мочеиспускание', 1),

-- Врождённые пороки сердца Q21.3, Q22.0
('Q21.3', NULL, s_nakata,  'Лёгочные артерии', 1),
('Q21.3', NULL, s_mcgoon,  'Лёгочные артерии', 2),
('Q22.0', NULL, s_nakata,  'Лёгочные артерии', 1),
('Q22.0', NULL, s_mcgoon,  'Лёгочные артерии', 2);

END;
$$;
