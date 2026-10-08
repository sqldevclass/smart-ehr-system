/** Monitoring checklists for each kind of medical device: wording, check interval and critical signs. */
export type Criterion = {
  code: string;
  label: string;
  critical?: boolean;
  criticalMessage?: string;
  hasNote?: boolean;
  notePlaceholder?: string;
};

export type FormDef = {
  label: string;
  intervalDays: number | null;
  hasSite: boolean;
  siteOptions?: string[];
  hasAntibioticProphylaxis?: boolean;
  criteria: Criterion[];
};

export const DEVICE_FORMS: Record<string, FormDef> = {
  cvc: {
    label: "Мониторинг центрального венозного катетера",
    intervalDays: 3,
    hasSite: true,
    siteOptions: ["яремная вена", "подключичная вена", "бедренная вена"],
    criteria: [
      { code: "cvc_1", label: "Необходимость ЦВК обоснована, есть необходимость в ЦВК. Отметка в дневнике врача" },
      { code: "cvc_2", label: "Обработка рук антисептиком производится каждый раз (до и после) контакта с ЦВК (при использовании)" },
      { code: "cvc_3", label: "Место пункции (кожа) и наружная часть катетера (хаб, порт) обрабатывается 70% спиртом (или 2% раствором хлоргексидина) при каждом доступе, при каждом использовании" },
      { code: "cvc_4", label: "Повязка над ЦВК была заменена в последние 5 суток. Кожа вокруг ЦВК была обработана антисептиком (спирт или хлоргексидин) перед заменой повязки" },
      { code: "cvc_5", label: "Имеются ли боль, покраснение, отечность кожи в области ЦВК?", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
    ],
  },
  tracheostomy: {
    label: "Мониторинг трахеостомы",
    intervalDays: 3,
    hasSite: false,
    criteria: [
      { code: "trach_1", label: "Проверка нужна ли трахеостома у данного пациента проведена врачом (обоснованность нахождения)" },
      { code: "trach_2", label: "Трахеостома закреплена должным образом" },
      { code: "trach_3", label: "Кожа вокруг трахеостомы чистая, края раны не отечны и не гиперемированы" },
      { code: "trach_4", label: "Трахеостома регулярно промывается изотоническим раствором" },
      { code: "trach_5", label: "Кожа вокруг трахеостомы обработана антисептиком (спирт или хлоргексидин)" },
      { code: "trach_6", label: "Вокруг трахеостомы на кожу наложена асептическая повязка" },
      { code: "trach_7", label: "В случае признаков воспаления вокруг трахеостомы, взят мазок на бакпосев", hasNote: true, notePlaceholder: "Отметить в какой день" },
    ],
  },
  ventilator: {
    label: "Мониторинг пациента на ИВЛ",
    intervalDays: 1,
    hasSite: false,
    criteria: [
      { code: "ivl_1", label: "Головной конец кровати поднят под углом 30-45 градусов (если нет противопоказаний)" },
      { code: "ivl_2", label: "Ежедневно проводится временное отключение седативных препаратов" },
      { code: "ivl_3", label: "Ежедневно проверяется готовность к экстубации" },
      { code: "ivl_4", label: "Пациенту на ИВЛ проводится инфузия H2-гистаминоблокатора или ингибитора протонной помпы (если нет противопоказаний)" },
      { code: "ivl_5", label: "Ежедневно ротовая полость обрабатывается раствором Хлоргексидина (0,05-0,12%)" },
      { code: "ivl_6", label: "Выполняется профилактика пролежней (+ оценка по шкале Брадена)" },
      { code: "ivl_7", label: "Профилактика тромбоза глубоких вен выполняется" },
    ],
  },
  urinary_catheter: {
    label: "Мониторинг мочевого катетера",
    intervalDays: 1,
    hasSite: false,
    // NOTE: source form skips #6 — numbering below is intentional.
    criteria: [
      { code: "uc_1", label: "Мочевой катетер необходим для данного пациента?" },
      { code: "uc_2", label: "Катетер закреплен должным образом к пациенту" },
      { code: "uc_3", label: "Моча беспрепятственно вытекает из катетера в мешок?" },
      { code: "uc_4", label: "Мешок для сбора ниже уровня мочевого пузыря?" },
      { code: "uc_5", label: "Мешок и трубка на некотором удалении от пола (не касаются пола)?" },
      { code: "uc_7", label: "Мочеприемник регулярно опорожняется" },
    ],
  },
  postop_wound: {
    label: "Мониторинг послеоперационной раны",
    intervalDays: null,
    hasSite: false,
    hasAntibioticProphylaxis: true,
    criteria: [
      { code: "wound_1", label: "Лихорадка у пациента", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_2", label: "Боль/болезненность разреза в области", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_3", label: "Отечность краев раны", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_4", label: "Гиперемия в области разреза", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_5", label: "Экссудат (отделяемое) из раны", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_6", label: "Гной из дренажа (если установлен дренаж)", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_7", label: "Выраженный отек тканей в области разреза", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_8", label: "Самопроизвольное расхождение швов", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
      { code: "wound_culture", label: "Отделяемое из раны взято на бак посев (при наличии признаков воспаления)", hasNote: true, notePlaceholder: "Дата взятия" },
    ],
  },
};
