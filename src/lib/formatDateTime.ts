/** Short local date and time, e.g. "07.10 14:05". */
export const formatDateTime = (date: Date): string => {
  const dd = date.getDate().toString().padStart(2, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const hh = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${dd}.${mm} ${hh}:${min}`;
};
