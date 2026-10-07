/** Relative label for a due time: "через 2 ч 5 мин", or "просрочено" once it has passed. */
export function formatRelativeTime(target: Date, now: Date = new Date()): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "просрочено";
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `через ${minutes} мин`;
  if (minutes === 0) return `через ${hours} ч`;
  return `через ${hours} ч ${minutes} мин`;
}
