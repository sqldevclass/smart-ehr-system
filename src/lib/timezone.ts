import { format as formatTz, toZonedTime, fromZonedTime } from "date-fns-tz";

// Convert UTC date from DB to local display string in the given timezone.
export function toLocal(
  utcDate: string | Date,
  timezone: string,
  fmt = "MMM d, HH:mm",
): string {
  const zoned = toZonedTime(new Date(utcDate), timezone);
  return formatTz(zoned, fmt, { timeZone: timezone });
}

// Convert a local Date (interpreted in the given timezone) to a real UTC Date.
export function toUTC(localDate: Date, timezone: string): Date {
  return fromZonedTime(localDate, timezone);
}

// Get the UTC ISO bounds of the given calendar day, expressed in the local timezone.
export function localDayBoundsUTC(
  date: Date,
  timezone: string,
): { start: string; end: string } {
  const zonedStart = new Date(date);
  zonedStart.setHours(0, 0, 0, 0);
  const zonedEnd = new Date(date);
  zonedEnd.setHours(23, 59, 59, 999);
  return {
    start: fromZonedTime(zonedStart, timezone).toISOString(),
    end: fromZonedTime(zonedEnd, timezone).toISOString(),
  };
}

// Convert a "HH:mm" local time string to a "HH:mm" UTC time string for the given timezone.
export function localTimeToUTC(timeStr: string, timezone: string): string {
  if (!timeStr) return timeStr;
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  now.setHours(h, m, 0, 0);
  const utc = fromZonedTime(now, timezone);
  return `${String(utc.getUTCHours()).padStart(2, "0")}:${String(utc.getUTCMinutes()).padStart(2, "0")}`;
}

// Convert a "HH:mm" UTC time string back to local "HH:mm" for display.
export function utcTimeToLocal(timeStr: string, timezone: string): string {
  if (!timeStr) return timeStr;
  const [h, m] = timeStr.split(":").map(Number);
  const utcDate = new Date();
  utcDate.setUTCHours(h, m, 0, 0);
  const zoned = toZonedTime(utcDate, timezone);
  return `${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`;
}
