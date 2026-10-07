/** Pain character tags a nurse can pick: stored code and its Russian label. */
export const painCharacterOptions = [
  { code: "Ж", label: "Жгучая" },
  { code: "Кол", label: "Колющая" },
  { code: "Н", label: "Ноющая" },
  { code: "О", label: "Острая" },
  { code: "П", label: "Постоянная" },
  { code: "Пл", label: "Пульсирующая" },
  { code: "Р", label: "Режущая" },
  { code: "Стр", label: "Стреляющая" },
  { code: "Сх", label: "Схваткообразная" },
  { code: "Туп", label: "Тупая" },
  { code: "Тян", label: "Тянущая" },
];

/** Text color for a 0-10 pain score. */
export const painColor = (score: number) =>
  score === 0 ? "text-green-700"
  : score <= 3 ? "text-yellow-700"
  : score <= 6 ? "text-orange-700"
  : "text-red-700";
