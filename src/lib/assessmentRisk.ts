/** Risk band for a scale score: stable key, Russian label and the Tailwind classes used for its colored chip. */
export function getRiskLevel(score: number, scaleCode: string) {
  if (scaleCode === "morse") {
    if (score >= 51)
      return {
        level: "high",
        label: "Высокий риск падения",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    if (score >= 25)
      return {
        level: "low",
        label: "Низкий риск падения",
        color: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    return {
      level: "none",
      label: "Нет риска падения",
      color: "bg-green-50 text-green-700 border-green-200",
    };
  }
  // GCS (lower = worse)
  if (scaleCode === "gcs") {
    if (score <= 8)
      return {
        level: "severe",
        label: "Тяжёлое нарушение сознания",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    if (score <= 12)
      return {
        level: "moderate",
        label: "Умеренное нарушение сознания",
        color: "bg-orange-50 text-orange-700 border-orange-200",
      };
    return {
      level: "mild",
      label: "Лёгкое нарушение сознания",
      color: "bg-green-50 text-green-700 border-green-200",
    };
  }
  if (scaleCode === "humpty_dumpty") {
    if (score >= 12)
      return {
        level: "high",
        label: "Высокий риск падения",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    return {
      level: "low",
      label: "Низкий риск падения",
      color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    };
  }
  if (scaleCode === "cpot") {
    if (score >= 6)
      return {
        level: "severe",
        label: "Сильная боль",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    if (score >= 2)
      return {
        level: "moderate",
        label: "Боль есть",
        color: "bg-orange-50 text-orange-700 border-orange-200",
      };
    return {
      level: "none",
      label: "Боли нет",
      color: "bg-green-50 text-green-700 border-green-200",
    };
  }
  // Braden (lower = worse)
  if (score <= 9)
    return {
      level: "very_high",
      label: "Очень высокий риск",
      color: "bg-red-100 text-red-800 border-red-300",
    };
  if (score <= 12)
    return {
      level: "high",
      label: "Высокий риск",
      color: "bg-red-50 text-red-700 border-red-200",
    };
  if (score <= 14)
    return {
      level: "moderate",
      label: "Умеренный риск",
      color: "bg-orange-50 text-orange-700 border-orange-200",
    };
  if (score <= 18)
    return {
      level: "mild",
      label: "Слабый риск",
      color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    };
  return {
    level: "none",
    label: "Нет риска",
    color: "bg-green-50 text-green-700 border-green-200",
  };
}
