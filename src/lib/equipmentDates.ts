import { addDays, format, parseISO, startOfDay } from "date-fns";

export const NOTICE_OPTIONS = [
  { days: 15, label: "15 дн." },
  { days: 30, label: "1 мес." },
  { days: 90, label: "3 мес." },
  { days: 180, label: "6 мес." },
  { days: 365, label: "1 год" },
] as const;

export type NoticeState = "overdue" | "soon" | null;

export function noticeState(date: string | null | undefined, noticeDays: number | null | undefined): NoticeState {
  if (!date) return null;
  const d = startOfDay(parseISO(date));
  if (isNaN(d.getTime())) return null;
  const today = startOfDay(new Date());
  if (d < today) return "overdue";
  if (d <= addDays(today, noticeDays ?? 30)) return "soon";
  return null;
}

export function formatDateRu(date: string | null | undefined) {
  if (!date) return "—";
  const d = parseISO(date);
  return isNaN(d.getTime()) ? "—" : format(d, "dd.MM.yyyy");
}
