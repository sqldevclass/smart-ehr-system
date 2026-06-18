-- Migration 133: Seed clinical_scales
-- 20 fully encoded scored scales + remaining as freetext stubs.
-- No FK references outside clinical_scales itself.

-- ============================================================
-- Fully encoded scored scales
-- ============================================================

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('cha2ds2_vasc', 'CHA₂DS₂-VASc', 'Риск инсульта при фибрилляции предсердий', 'scored',
'[
  {"id":"chf","label":"Застойная сердечная недостаточность","type":"boolean","score":1},
  {"id":"htn","label":"Артериальная гипертензия","type":"boolean","score":1},
  {"id":"age75","label":"Возраст ≥ 75 лет","type":"boolean","score":2},
  {"id":"dm","label":"Сахарный диабет","type":"boolean","score":1},
  {"id":"stroke","label":"Инсульт / ТИА / тромбоэмболия в анамнезе","type":"boolean","score":2},
  {"id":"vd","label":"Сосудистые заболевания (ИМ, ЗАНК, бляшки аорты)","type":"boolean","score":1},
  {"id":"age65","label":"Возраст 65–74 года","type":"boolean","score":1},
  {"id":"female","label":"Женский пол","type":"boolean","score":1}
]',
'{"ranges":[
  {"min":0,"max":0,"label":"Низкий риск","color":"green"},
  {"min":1,"max":1,"label":"Умеренный риск — рассмотреть антикоагуляцию","color":"yellow"},
  {"min":2,"max":9,"label":"Высокий риск — антикоагуляция показана","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('has_bled', 'HAS-BLED', 'Риск кровотечений на антикоагулянтах', 'scored',
'[
  {"id":"htn","label":"Неконтролируемая гипертензия (АД сист. > 160 мм рт.ст.)","type":"boolean","score":1},
  {"id":"renal","label":"Нарушение функции почек (диализ / креатинин > 200 мкмоль/л)","type":"boolean","score":1},
  {"id":"liver","label":"Нарушение функции печени (цирроз / билирубин > 2× N)","type":"boolean","score":1},
  {"id":"stroke","label":"Инсульт в анамнезе","type":"boolean","score":1},
  {"id":"bleed","label":"Кровотечение в анамнезе или предрасположенность","type":"boolean","score":1},
  {"id":"inr","label":"Лабильное МНО (< 60% времени в терапевтическом диапазоне)","type":"boolean","score":1},
  {"id":"elderly","label":"Возраст > 65 лет","type":"boolean","score":1},
  {"id":"drugs","label":"Антиагреганты или НПВП","type":"boolean","score":1},
  {"id":"alcohol","label":"Злоупотребление алкоголем (≥ 8 доз/нед)","type":"boolean","score":1}
]',
'{"ranges":[
  {"min":0,"max":2,"label":"Низкий риск кровотечений","color":"green"},
  {"min":3,"max":9,"label":"Высокий риск — осторожность, коррекция факторов","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('nyha', 'NYHA', 'Функциональный класс сердечной недостаточности', 'scored',
'[
  {"id":"class","label":"Функциональный класс","type":"select","options":[
    {"value":"1","label":"I — Нет ограничений физической активности","score":1},
    {"value":"2","label":"II — Незначительное ограничение (одышка при умеренной нагрузке)","score":2},
    {"value":"3","label":"III — Выраженное ограничение (одышка при минимальной нагрузке)","score":3},
    {"value":"4","label":"IV — Симптомы в покое, невозможность любой активности","score":4}
  ]}
]',
'{"ranges":[
  {"min":1,"max":1,"label":"ФК I — Компенсация","color":"green"},
  {"min":2,"max":2,"label":"ФК II — Лёгкая СН","color":"yellow"},
  {"min":3,"max":3,"label":"ФК III — Умеренная СН","color":"orange"},
  {"min":4,"max":4,"label":"ФК IV — Тяжёлая СН","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('wells_pe', 'Wells PE', 'Вероятность тромбоэмболии лёгочной артерии', 'scored',
'[
  {"id":"dvt_signs","label":"Клинические признаки ТГВ","type":"boolean","score":3},
  {"id":"alt_dx","label":"Альтернативный диагноз менее вероятен, чем ТЭЛА","type":"boolean","score":3},
  {"id":"hr","label":"ЧСС > 100 уд/мин","type":"boolean","score":1},
  {"id":"immob","label":"Иммобилизация или операция за последние 4 недели","type":"boolean","score":1},
  {"id":"prior_dvt","label":"ТГВ или ТЭЛА в анамнезе","type":"boolean","score":1},
  {"id":"hemoptysis","label":"Кровохарканье","type":"boolean","score":1},
  {"id":"malignancy","label":"Злокачественное новообразование (активное или паллиатив)","type":"boolean","score":1}
]',
'{"ranges":[
  {"min":0,"max":1,"label":"Низкая вероятность ТЭЛА","color":"green"},
  {"min":2,"max":6,"label":"Умеренная вероятность — D-димер","color":"yellow"},
  {"min":7,"max":12,"label":"Высокая вероятность — КТ-ангиография","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('wells_dvt', 'Wells DVT', 'Вероятность тромбоза глубоких вен', 'scored',
'[
  {"id":"cancer","label":"Активное злокачественное новообразование","type":"boolean","score":1},
  {"id":"paralysis","label":"Паралич или недавняя иммобилизация нижних конечностей","type":"boolean","score":1},
  {"id":"bedridden","label":"Постельный режим > 3 дней или операция за последние 12 нед","type":"boolean","score":1},
  {"id":"tenderness","label":"Локальная болезненность по ходу глубоких вен","type":"boolean","score":1},
  {"id":"leg_swelling","label":"Отёк всей ноги","type":"boolean","score":1},
  {"id":"calf_swelling","label":"Икра отёчнее на ≥ 3 см (на 10 см ниже бугристости б/б кости)","type":"boolean","score":1},
  {"id":"pitting","label":"Ямочный отёк только на симптоматической ноге","type":"boolean","score":1},
  {"id":"collateral","label":"Расширенные поверхностные несафенные вены","type":"boolean","score":1},
  {"id":"prior_dvt","label":"ТГВ в анамнезе","type":"boolean","score":1},
  {"id":"alt_dx","label":"Альтернативный диагноз столь же или более вероятен","type":"boolean","score":-2}
]',
'{"ranges":[
  {"min":-2,"max":0,"label":"Низкая вероятность ТГВ","color":"green"},
  {"min":1,"max":2,"label":"Умеренная вероятность ТГВ","color":"yellow"},
  {"min":3,"max":9,"label":"Высокая вероятность ТГВ","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('phq9', 'PHQ-9', 'Скрининг и оценка тяжести депрессии', 'scored',
'[
  {"id":"q1","label":"Слабый интерес или удовольствие от дел","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q2","label":"Подавленность, депрессия или безнадёжность","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q3","label":"Трудности со сном или слишком много сна","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q4","label":"Усталость или упадок сил","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q5","label":"Плохой аппетит или переедание","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q6","label":"Ощущение себя плохим человеком или неудачником","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q7","label":"Трудности с концентрацией (чтение, просмотр ТВ)","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q8","label":"Замедленность движений или речи, либо суетливость","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q9","label":"Мысли о причинении себе вреда или о смерти","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]}
]',
'{"ranges":[
  {"min":0,"max":4,"label":"Минимальная депрессия","color":"green"},
  {"min":5,"max":9,"label":"Лёгкая депрессия","color":"yellow"},
  {"min":10,"max":14,"label":"Умеренная депрессия","color":"orange"},
  {"min":15,"max":19,"label":"Умеренно тяжёлая депрессия","color":"red"},
  {"min":20,"max":27,"label":"Тяжёлая депрессия","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('gad7', 'GAD-7', 'Скрининг генерализованного тревожного расстройства', 'scored',
'[
  {"id":"q1","label":"Ощущение нервозности, тревоги или взвинченности","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q2","label":"Невозможность остановить беспокойство","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q3","label":"Чрезмерное беспокойство о разных вещах","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q4","label":"Трудности с расслаблением","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q5","label":"Непоседливость (невозможность усидеть на месте)","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q6","label":"Раздражительность","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]},
  {"id":"q7","label":"Страх, что что-то ужасное может случиться","type":"select","options":[
    {"value":"0","label":"Никогда","score":0},{"value":"1","label":"Несколько дней","score":1},
    {"value":"2","label":"Более половины дней","score":2},{"value":"3","label":"Почти каждый день","score":3}]}
]',
'{"ranges":[
  {"min":0,"max":4,"label":"Минимальная тревога","color":"green"},
  {"min":5,"max":9,"label":"Лёгкая тревога","color":"yellow"},
  {"min":10,"max":14,"label":"Умеренная тревога","color":"orange"},
  {"min":15,"max":21,"label":"Тяжёлая тревога","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('curb65', 'CURB-65', 'Тяжесть пневмонии — амбулаторно vs госпитализация', 'scored',
'[
  {"id":"confusion","label":"Нарушение сознания (новое)","type":"boolean","score":1},
  {"id":"urea","label":"Мочевина > 7 ммоль/л","type":"boolean","score":1},
  {"id":"rr","label":"ЧДД ≥ 30/мин","type":"boolean","score":1},
  {"id":"bp","label":"АД сист. < 90 или диаст. ≤ 60 мм рт.ст.","type":"boolean","score":1},
  {"id":"age65","label":"Возраст ≥ 65 лет","type":"boolean","score":1}
]',
'{"ranges":[
  {"min":0,"max":1,"label":"Низкий риск — амбулаторное лечение","color":"green"},
  {"min":2,"max":2,"label":"Умеренный риск — краткая госпитализация","color":"yellow"},
  {"min":3,"max":5,"label":"Высокий риск — госпитализация / ОРИТ","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('mrs', 'mRS', 'Модифицированная шкала Рэнкина — инвалидизация после инсульта', 'scored',
'[
  {"id":"grade","label":"Степень инвалидизации","type":"select","options":[
    {"value":"0","label":"0 — Нет симптомов","score":0},
    {"value":"1","label":"1 — Нет существенной нетрудоспособности","score":1},
    {"value":"2","label":"2 — Лёгкая нетрудоспособность — самообслуживание без помощи","score":2},
    {"value":"3","label":"3 — Умеренная нетрудоспособность — ходит самостоятельно","score":3},
    {"value":"4","label":"4 — Умеренно тяжёлая — не ходит без помощи","score":4},
    {"value":"5","label":"5 — Тяжёлая — постельный режим, постоянный уход","score":5},
    {"value":"6","label":"6 — Смерть","score":6}
  ]}
]',
'{"ranges":[
  {"min":0,"max":1,"label":"Без значимой инвалидизации","color":"green"},
  {"min":2,"max":3,"label":"Умеренная инвалидизация","color":"yellow"},
  {"min":4,"max":5,"label":"Тяжёлая инвалидизация","color":"red"},
  {"min":6,"max":6,"label":"Летальный исход","color":"black"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('qsofa', 'qSOFA', 'Быстрый скрининг сепсиса', 'scored',
'[
  {"id":"rr","label":"ЧДД ≥ 22/мин","type":"boolean","score":1},
  {"id":"ams","label":"Изменение сознания (ШКГ < 15)","type":"boolean","score":1},
  {"id":"sbp","label":"АД систолическое ≤ 100 мм рт.ст.","type":"boolean","score":1}
]',
'{"ranges":[
  {"min":0,"max":1,"label":"Низкий риск сепсиса","color":"green"},
  {"min":2,"max":3,"label":"Высокий риск — оценить по SOFA, ОРИТ","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('child_pugh', 'Child-Pugh', 'Тяжесть цирроза печени и прогноз', 'scored',
'[
  {"id":"bilirubin","label":"Билирубин","type":"select","options":[
    {"value":"1","label":"< 34 мкмоль/л","score":1},
    {"value":"2","label":"34–51 мкмоль/л","score":2},
    {"value":"3","label":"> 51 мкмоль/л","score":3}]},
  {"id":"albumin","label":"Альбумин","type":"select","options":[
    {"value":"1","label":"> 35 г/л","score":1},
    {"value":"2","label":"28–35 г/л","score":2},
    {"value":"3","label":"< 28 г/л","score":3}]},
  {"id":"inr","label":"МНО","type":"select","options":[
    {"value":"1","label":"< 1.7","score":1},
    {"value":"2","label":"1.7–2.3","score":2},
    {"value":"3","label":"> 2.3","score":3}]},
  {"id":"ascites","label":"Асцит","type":"select","options":[
    {"value":"1","label":"Нет","score":1},
    {"value":"2","label":"Небольшой, контролируется","score":2},
    {"value":"3","label":"Умеренный–тяжёлый, рефрактерный","score":3}]},
  {"id":"encephalopathy","label":"Энцефалопатия","type":"select","options":[
    {"value":"1","label":"Нет","score":1},
    {"value":"2","label":"I–II степень","score":2},
    {"value":"3","label":"III–IV степень","score":3}]}
]',
'{"ranges":[
  {"min":5,"max":6,"label":"Класс A — компенсация","color":"green"},
  {"min":7,"max":9,"label":"Класс B — субкомпенсация","color":"yellow"},
  {"min":10,"max":15,"label":"Класс C — декомпенсация","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('stop_bang', 'STOP-BANG', 'Скрининг синдрома обструктивного апноэ сна', 'scored',
'[
  {"id":"snoring","label":"S — Громко храпите?","type":"boolean","score":1},
  {"id":"tired","label":"T — Часто устаёте или ощущаете сонливость?","type":"boolean","score":1},
  {"id":"observed","label":"O — Кто-либо наблюдал остановки дыхания во сне?","type":"boolean","score":1},
  {"id":"pressure","label":"P — Артериальная гипертензия или лечение от неё?","type":"boolean","score":1},
  {"id":"bmi","label":"B — ИМТ > 35 кг/м²?","type":"boolean","score":1},
  {"id":"age","label":"A — Возраст > 50 лет?","type":"boolean","score":1},
  {"id":"neck","label":"N — Окружность шеи > 40 см?","type":"boolean","score":1},
  {"id":"gender","label":"G — Мужской пол?","type":"boolean","score":1}
]',
'{"ranges":[
  {"min":0,"max":2,"label":"Низкий риск СОАС","color":"green"},
  {"min":3,"max":4,"label":"Умеренный риск СОАС","color":"yellow"},
  {"min":5,"max":8,"label":"Высокий риск СОАС — полисомнография","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('epworth', 'Шкала сонливости Эпворта', 'Дневная сонливость — подозрение на СОАС', 'scored',
'[
  {"id":"sitting_reading","label":"Сидя и читая","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"tv","label":"Просматривая телевизор","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"public","label":"Сидя неактивно в общественном месте","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"passenger","label":"Как пассажир в машине (1 час без перерыва)","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"lying","label":"Лёжа отдыхая во второй половине дня","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"talking","label":"Сидя и разговаривая","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"lunch","label":"Сидя спокойно после обеда без алкоголя","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]},
  {"id":"driving","label":"За рулём в пробке (несколько минут)","type":"select","options":[
    {"value":"0","label":"Никогда не засыпаю","score":0},{"value":"1","label":"Незначительная вероятность","score":1},
    {"value":"2","label":"Умеренная вероятность","score":2},{"value":"3","label":"Высокая вероятность","score":3}]}
]',
'{"ranges":[
  {"min":0,"max":10,"label":"Норма","color":"green"},
  {"min":11,"max":15,"label":"Умеренная сонливость","color":"yellow"},
  {"min":16,"max":24,"label":"Тяжёлая сонливость — обследование","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('cat', 'CAT', 'Оценка влияния ХОБЛ на качество жизни', 'scored',
'[
  {"id":"cough","label":"Кашель (0 — никогда, 5 — постоянно)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"phlegm","label":"Мокрота (0 — нет, 5 — постоянно)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"chest","label":"Стеснение в груди (0 — нет, 5 — очень сильное)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"breathless","label":"Одышка при подъёме на 1 пролёт (0 — нет, 5 — очень сильная)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"activity","label":"Ограничение домашних дел (0 — нет, 5 — очень выражено)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"confidence","label":"Уверенность вне дома (0 — уверен, 5 — совсем не уверен)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"sleep","label":"Качество сна (0 — крепкий, 5 — очень плохой)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]},
  {"id":"energy","label":"Энергичность (0 — полна сил, 5 — нет сил)","type":"select","options":[
    {"value":"0","label":"0","score":0},{"value":"1","label":"1","score":1},{"value":"2","label":"2","score":2},
    {"value":"3","label":"3","score":3},{"value":"4","label":"4","score":4},{"value":"5","label":"5","score":5}]}
]',
'{"ranges":[
  {"min":0,"max":9,"label":"Малое влияние ХОБЛ","color":"green"},
  {"min":10,"max":20,"label":"Умеренное влияние","color":"yellow"},
  {"min":21,"max":30,"label":"Сильное влияние","color":"orange"},
  {"min":31,"max":40,"label":"Очень сильное влияние","color":"red"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('act', 'ACT', 'Контроль бронхиальной астмы', 'scored',
'[
  {"id":"q1","label":"Как часто астма мешала работе, учёбе или домашним делам (последние 4 нед)?","type":"select","options":[
    {"value":"1","label":"Постоянно","score":1},{"value":"2","label":"Очень часто","score":2},
    {"value":"3","label":"Иногда","score":3},{"value":"4","label":"Редко","score":4},{"value":"5","label":"Никогда","score":5}]},
  {"id":"q2","label":"Как часто замечали одышку (последние 4 нед)?","type":"select","options":[
    {"value":"1","label":"Чаще 1 раза в день","score":1},{"value":"2","label":"1 раз в день","score":2},
    {"value":"3","label":"3–6 раз в неделю","score":3},{"value":"4","label":"1–2 раза в неделю","score":4},
    {"value":"5","label":"Ни разу","score":5}]},
  {"id":"q3","label":"Как часто симптомы астмы будили вас ночью (последние 4 нед)?","type":"select","options":[
    {"value":"1","label":"4 ночи в неделю и чаще","score":1},{"value":"2","label":"2–3 ночи в неделю","score":2},
    {"value":"3","label":"1 раз в неделю","score":3},{"value":"4","label":"1–2 раза","score":4},
    {"value":"5","label":"Ни разу","score":5}]},
  {"id":"q4","label":"Как часто использовали препарат скорой помощи (последние 4 нед)?","type":"select","options":[
    {"value":"1","label":"3 раза в день и чаще","score":1},{"value":"2","label":"1–2 раза в день","score":2},
    {"value":"3","label":"2–3 раза в неделю","score":3},{"value":"4","label":"1 раз в неделю или реже","score":4},
    {"value":"5","label":"Ни разу","score":5}]},
  {"id":"q5","label":"Как бы вы оценили контроль астмы за последние 4 недели?","type":"select","options":[
    {"value":"1","label":"Совсем не контролируется","score":1},{"value":"2","label":"Плохо контролируется","score":2},
    {"value":"3","label":"Частично контролируется","score":3},{"value":"4","label":"Хорошо контролируется","score":4},
    {"value":"5","label":"Полностью контролируется","score":5}]}
]',
'{"ranges":[
  {"min":5,"max":19,"label":"Астма не контролируется","color":"red"},
  {"min":20,"max":24,"label":"Астма частично контролируется","color":"yellow"},
  {"min":25,"max":25,"label":"Астма полностью контролируется","color":"green"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('barthel', 'Индекс Бартел', 'Функциональная независимость в повседневной жизни', 'scored',
'[
  {"id":"feeding","label":"Приём пищи","type":"select","options":[
    {"value":"0","label":"Зависим","score":0},{"value":"5","label":"Нуждается в помощи","score":5},
    {"value":"10","label":"Независим","score":10}]},
  {"id":"bathing","label":"Купание","type":"select","options":[
    {"value":"0","label":"Зависим","score":0},{"value":"5","label":"Независим","score":5}]},
  {"id":"grooming","label":"Уход за собой (умывание, причёсывание, бритьё)","type":"select","options":[
    {"value":"0","label":"Нуждается в помощи","score":0},{"value":"5","label":"Независим","score":5}]},
  {"id":"dressing","label":"Одевание","type":"select","options":[
    {"value":"0","label":"Зависим","score":0},{"value":"5","label":"Нуждается в помощи","score":5},
    {"value":"10","label":"Независим","score":10}]},
  {"id":"bowels","label":"Контроль стула","type":"select","options":[
    {"value":"0","label":"Недержание","score":0},{"value":"5","label":"Случайные эпизоды","score":5},
    {"value":"10","label":"Удержание","score":10}]},
  {"id":"bladder","label":"Контроль мочеиспускания","type":"select","options":[
    {"value":"0","label":"Недержание","score":0},{"value":"5","label":"Случайные эпизоды","score":5},
    {"value":"10","label":"Удержание","score":10}]},
  {"id":"toilet","label":"Пользование туалетом","type":"select","options":[
    {"value":"0","label":"Зависим","score":0},{"value":"5","label":"Нуждается в помощи","score":5},
    {"value":"10","label":"Независим","score":10}]},
  {"id":"transfer","label":"Перемещение кровать–кресло","type":"select","options":[
    {"value":"0","label":"Не способен","score":0},{"value":"5","label":"Значительная помощь","score":5},
    {"value":"10","label":"Минимальная помощь","score":10},{"value":"15","label":"Независим","score":15}]},
  {"id":"mobility","label":"Ходьба по ровной поверхности","type":"select","options":[
    {"value":"0","label":"Не способен","score":0},{"value":"5","label":"Независим на коляске","score":5},
    {"value":"10","label":"Ходит с помощью","score":10},{"value":"15","label":"Независим","score":15}]},
  {"id":"stairs","label":"Подъём по лестнице","type":"select","options":[
    {"value":"0","label":"Не способен","score":0},{"value":"5","label":"Нуждается в помощи","score":5},
    {"value":"10","label":"Независим","score":10}]}
]',
'{"ranges":[
  {"min":0,"max":20,"label":"Полная зависимость","color":"red"},
  {"min":21,"max":60,"label":"Тяжёлая зависимость","color":"red"},
  {"min":61,"max":90,"label":"Умеренная зависимость","color":"yellow"},
  {"min":91,"max":99,"label":"Лёгкая зависимость","color":"yellow"},
  {"min":100,"max":100,"label":"Полная независимость","color":"green"}
]}');

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('findrisc', 'FINDRISC', 'Риск развития сахарного диабета 2 типа', 'scored',
'[
  {"id":"age","label":"Возраст","type":"select","options":[
    {"value":"0","label":"< 45 лет","score":0},{"value":"2","label":"45–54 года","score":2},
    {"value":"3","label":"55–64 года","score":3},{"value":"4","label":"≥ 65 лет","score":4}]},
  {"id":"bmi","label":"ИМТ","type":"select","options":[
    {"value":"0","label":"< 25 кг/м²","score":0},{"value":"1","label":"25–30 кг/м²","score":1},
    {"value":"3","label":"> 30 кг/м²","score":3}]},
  {"id":"waist","label":"Окружность талии (муж / жен)","type":"select","options":[
    {"value":"0","label":"< 94 / < 80 см","score":0},{"value":"3","label":"94–102 / 80–88 см","score":3},
    {"value":"4","label":"> 102 / > 88 см","score":4}]},
  {"id":"activity","label":"Физическая активность ≥ 30 мин/день","type":"select","options":[
    {"value":"0","label":"Да","score":0},{"value":"2","label":"Нет","score":2}]},
  {"id":"vegetables","label":"Ежедневное употребление овощей и фруктов","type":"select","options":[
    {"value":"0","label":"Да","score":0},{"value":"1","label":"Нет","score":1}]},
  {"id":"htn_meds","label":"Приём антигипертензивных препаратов","type":"select","options":[
    {"value":"0","label":"Нет","score":0},{"value":"2","label":"Да","score":2}]},
  {"id":"glucose","label":"Высокий уровень глюкозы в анамнезе","type":"select","options":[
    {"value":"0","label":"Нет","score":0},{"value":"5","label":"Да","score":5}]},
  {"id":"family","label":"Сахарный диабет у родственников","type":"select","options":[
    {"value":"0","label":"Нет","score":0},
    {"value":"3","label":"Да (дед/баб, тётя/дядя, двоюродный)","score":3},
    {"value":"5","label":"Да (родитель, брат/сестра, ребёнок)","score":5}]}
]',
'{"ranges":[
  {"min":0,"max":6,"label":"Низкий риск СД2 (1 из 100)","color":"green"},
  {"min":7,"max":11,"label":"Умеренный риск (1 из 25)","color":"yellow"},
  {"min":12,"max":14,"label":"Умеренно высокий риск (1 из 6)","color":"orange"},
  {"min":15,"max":20,"label":"Высокий риск (1 из 3)","color":"red"},
  {"min":21,"max":26,"label":"Очень высокий риск (1 из 2)","color":"red"}
]}');

-- NIHSS — freetext (requires neurological examination, not a questionnaire)
INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('nihss', 'NIHSS', 'Тяжесть неврологического дефицита при инсульте', 'freetext', '[]',
'{"ranges":[
  {"min":0,"max":0,"label":"Нет дефицита","color":"green"},
  {"min":1,"max":4,"label":"Лёгкий инсульт","color":"yellow"},
  {"min":5,"max":15,"label":"Умеренный инсульт","color":"orange"},
  {"min":16,"max":20,"label":"Умеренно тяжёлый инсульт","color":"red"},
  {"min":21,"max":42,"label":"Тяжёлый инсульт","color":"red"}
]}');

-- MELD-Na — freetext (calculated from lab values)
INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('meld_na', 'MELD-Na', 'Прогноз при циррозе — риск прогрессирования до трансплантации', 'freetext', '[]',
'{"ranges":[
  {"min":0,"max":9,"label":"< 2% смертность за 90 дней","color":"green"},
  {"min":10,"max":19,"label":"6% смертность за 90 дней","color":"yellow"},
  {"min":20,"max":29,"label":"20% смертность за 90 дней","color":"orange"},
  {"min":30,"max":39,"label":"53% смертность за 90 дней","color":"red"},
  {"min":40,"max":99,"label":"> 70% смертность за 90 дней","color":"red"}
]}');

-- ============================================================
-- Freetext stubs (to be replaced with scored versions later)
-- ============================================================

INSERT INTO public.clinical_scales (code, name, description, input_mode, items, scoring) VALUES
('ehra',            'EHRA',                        'Тяжесть симптомов ФП',                              'freetext', '[]', '{"ranges":[]}'),
('score2',          'SCORE2 / SCORE2-OP',          'Общий сердечно-сосудистый риск',                    'freetext', '[]', '{"ranges":[]}'),
('grace',           'GRACE',                       'Риск осложнений ОКС',                               'freetext', '[]', '{"ranges":[]}'),
('timi',            'TIMI',                        'Риск при ОКС',                                      'freetext', '[]', '{"ranges":[]}'),
('hfa_peff',        'HFA-PEFF score',              'Диагностика HFpEF',                                 'freetext', '[]', '{"ranges":[]}'),
('h2fpef',          'H₂FPEF score',               'Диагностика HFpEF (альтернативная)',                 'freetext', '[]', '{"ranges":[]}'),
('syntax',          'SYNTAX score',                'Сложность поражения коронарных артерий',            'freetext', '[]', '{"ranges":[]}'),
('abcd2',           'ABCD²',                      'Риск инсульта после ТИА',                           'freetext', '[]', '{"ranges":[]}'),
('moca',            'MoCA',                        'Скрининг когнитивных нарушений',                    'freetext', '[]', '{"ranges":[]}'),
('mmse',            'MMSE',                        'Скрининг деменции',                                 'freetext', '[]', '{"ranges":[]}'),
('updrs',           'UPDRS',                       'Болезнь Паркинсона — тяжесть',                     'freetext', '[]', '{"ranges":[]}'),
('edss',            'EDSS',                        'Рассеянный склероз — инвалидизация',                'freetext', '[]', '{"ranges":[]}'),
('hads',            'HADS',                        'Тревога и депрессия у соматических пациентов',      'freetext', '[]', '{"ranges":[]}'),
('isi',             'ISI',                         'Тяжесть инсомнии',                                  'freetext', '[]', '{"ranges":[]}'),
('mmrc',            'mMRC',                        'Одышка при ХОБЛ',                                   'freetext', '[]', '{"ranges":[]}'),
('glasgow_blatchford','Glasgow-Blatchford',         'Риск при желудочно-кишечном кровотечении',          'freetext', '[]', '{"ranges":[]}'),
('gerd_q',          'GERD-Q',                      'Вероятность ГЭРБ',                                  'freetext', '[]', '{"ranges":[]}'),
('ranson',          'Ranson criteria',             'Тяжесть острого панкреатита',                       'freetext', '[]', '{"ranges":[]}'),
('mayo_uc',         'Mayo score',                  'Активность язвенного колита',                       'freetext', '[]', '{"ranges":[]}'),
('cdai',            'CDAI',                        'Активность болезни Крона',                          'freetext', '[]', '{"ranges":[]}'),
('kdigo',           'KDIGO CKD staging',           'Стадирование ХБП',                                  'freetext', '[]', '{"ranges":[]}'),
('kfre',            'KFRE',                        'Риск прогрессирования ХБП',                         'freetext', '[]', '{"ranges":[]}'),
('das28',           'DAS28',                       'Активность ревматоидного артрита',                  'freetext', '[]', '{"ranges":[]}'),
('basdai',          'BASDAI',                      'Активность анкилозирующего спондилита',             'freetext', '[]', '{"ranges":[]}'),
('sledai',          'SLEDAI',                      'Активность СКВ',                                    'freetext', '[]', '{"ranges":[]}'),
('sofa',            'SOFA',                        'Органная дисфункция при сепсисе',                   'freetext', '[]', '{"ranges":[]}'),
('apache2',         'APACHE II',                   'Тяжесть состояния в ОРИТ',                          'freetext', '[]', '{"ranges":[]}'),
('4t_score',        '4T score',                    'Гепарин-индуцированная тромбоцитопения',            'freetext', '[]', '{"ranges":[]}'),
('khorana',         'Khorana score',               'Риск тромбозов у онкобольных',                      'freetext', '[]', '{"ranges":[]}'),
('ipss_r',          'IPSS-R',                      'Миелодиспластический синдром',                      'freetext', '[]', '{"ranges":[]}'),
('ecog',            'ECOG Performance Status',     'Функциональный статус онкобольного',                'freetext', '[]', '{"ranges":[]}'),
('karnofsky',       'Karnofsky score',             'Функциональный статус',                             'freetext', '[]', '{"ranges":[]}'),
('tnm',             'TNM',                         'Стадирование злокачественных опухолей',             'freetext', '[]', '{"ranges":[]}'),
('imdc',            'IMDC score',                  'Метастатический рак почки',                         'freetext', '[]', '{"ranges":[]}'),
('cfs',             'Clinical Frailty Scale',      'Хрупкость пожилого пациента',                       'freetext', '[]', '{"ranges":[]}'),
('gds',             'GDS',                         'Гериатрическая шкала депрессии',                    'freetext', '[]', '{"ranges":[]}'),
('ipss',            'IPSS',                        'Тяжесть симптомов ДГПЖ',                            'freetext', '[]', '{"ranges":[]}'),
('iief5',           'IIEF-5',                      'Степень эректильной дисфункции',                    'freetext', '[]', '{"ranges":[]}'),
('nih_cpsi',        'NIH-CPSI',                    'Хронический простатит — симптомы',                  'freetext', '[]', '{"ranges":[]}'),
('iciq',            'ICIQ-UI SF',                  'Тяжесть недержания мочи',                           'freetext', '[]', '{"ranges":[]}'),
('capra',           'CAPRA score',                 'Рак простаты — прогноз',                            'freetext', '[]', '{"ranges":[]}'),
('damico',          'D''Amico risk classification','Рак простаты — классификация риска',                'freetext', '[]', '{"ranges":[]}'),
('eortc',           'EORTC risk tables',           'Рак мочевого пузыря',                               'freetext', '[]', '{"ranges":[]}'),
('popq',            'POP-Q',                       'Пролапс тазовых органов',                           'freetext', '[]', '{"ranges":[]}'),
('dvss',            'DVSS',                        'Дисфункциональное мочеиспускание',                  'freetext', '[]', '{"ranges":[]}'),
('nakata',          'Индекс Наката',               'Врождённые пороки сердца — лёгочные артерии',       'freetext', '[]', '{"ranges":[]}'),
('mcgoon',          'Индекс МакГуна',              'Врождённые пороки сердца',                          'freetext', '[]', '{"ranges":[]}'),
('bmi_waist',       'BMI + окружность талии',      'Кардиометаболический риск при ожирении',            'freetext', '[]', '{"ranges":[]}'),
('eoss',            'EOSS',                        'Стадирование ожирения',                             'freetext', '[]', '{"ranges":[]}'),
('frax',            'FRAX',                        'Риск переломов',                                    'freetext', '[]', '{"ranges":[]}'),
('ata',             'ATA risk stratification',     'Рак щитовидной железы',                             'freetext', '[]', '{"ranges":[]}');
