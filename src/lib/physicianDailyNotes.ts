// Physician daily progress notes (дневниковые записи) for surgical inpatients:
// one note is required for every hospital-local calendar day of the stay EXCEPT
// the admission day -- i.e. admission day + 1 through the discharge day, or
// through yesterday while the patient is still admitted.
// (Nursing notes have their own twice-daily rule in dailyNoteSchedule.ts.)
import { formatInTimeZone } from "date-fns-tz";

export const PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000002";
// Notes by this job title don't count toward the requirement.
export const DAILY_NOTE_EXCLUDED_JOB_TITLE_CODE = "anesthesiologist_intensivist";

// "yyyy-MM-dd" of an instant, in the hospital's timezone.
export function localDayKey(instant: string | Date, tz: string): string {
  return formatInTimeZone(new Date(instant), tz, "yyyy-MM-dd");
}

// Calendar arithmetic on "yyyy-MM-dd" keys (UTC-based, so no DST drift).
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface StayWindow {
  admittedAt: string;
  dischargedAt: string | null;
}

// Every day that needs a note, limited to [fromKey, toKey] (report period).
export function requiredNoteDays(
  stay: StayWindow,
  opts: { now: Date; tz: string; fromKey: string; toKey: string }
): string[] {
  const first = addDaysToKey(localDayKey(stay.admittedAt, opts.tz), 1);
  const last = stay.dischargedAt
    ? localDayKey(stay.dischargedAt, opts.tz)
    : addDaysToKey(localDayKey(opts.now, opts.tz), -1);
  const start = first > opts.fromKey ? first : opts.fromKey;
  const end = last < opts.toKey ? last : opts.toKey;
  const days: string[] = [];
  for (let k = start; k <= end; k = addDaysToKey(k, 1)) days.push(k);
  return days;
}

// "12.10–14.10, 17.10" from sorted day keys.
export function formatDayRanges(keys: string[]): string {
  const label = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
  const parts: string[] = [];
  let i = 0;
  while (i < keys.length) {
    let j = i;
    while (j + 1 < keys.length && addDaysToKey(keys[j], 1) === keys[j + 1]) j++;
    parts.push(i === j ? label(keys[i]) : `${label(keys[i])}–${label(keys[j])}`);
    i = j + 1;
  }
  return parts.join(", ");
}

