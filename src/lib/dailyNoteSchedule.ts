import { addDays, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

// Nursing daily notes are due twice a day, at 08:00 and 20:00 hospital
// time. A note recorded inside the current 12-hour window (08:00-20:00
// or 20:00-08:00) satisfies that window.

export function getDailyNoteSlots(now: Date, tz: string): { current: Date; next: Date } {
  const local = toZonedTime(now, tz);
  const at = (dayOffset: number, hour: number) =>
    fromZonedTime(
      `${format(addDays(local, dayOffset), "yyyy-MM-dd")}T${String(hour).padStart(2, "0")}:00:00`,
      tz,
    );
  const slots = [at(-1, 20), at(0, 8), at(0, 20), at(1, 8)];
  let current = slots[0];
  for (const s of slots) if (s.getTime() <= now.getTime()) current = s;
  const next = slots.find((s) => s.getTime() > now.getTime()) as Date;
  return { current, next };
}

export function getDailyNoteStatus(
  lastNoteAt: Date | null,
  now: Date,
  tz: string,
): { dueAt: Date; overdue: boolean } {
  const { current, next } = getDailyNoteSlots(now, tz);
  const satisfied = !!lastNoteAt && lastNoteAt.getTime() >= current.getTime();
  return { dueAt: satisfied ? next : current, overdue: !satisfied };
}
