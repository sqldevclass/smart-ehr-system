const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Converts a hospital-local wall-clock string "yyyy-MM-ddTHH:mm" into whole
 * minutes. Uses Date.UTC only as a plain arithmetic anchor — no timezone is
 * ever applied, so the difference between two values is a pure wall-clock
 * difference (and stays correct across midnight, since the date is part of it).
 */
function toWallClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = WALL_CLOCK_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  return Date.UTC(year, month - 1, day, hours, minutes) / 60000;
}

/**
 * Duration of an operation in whole minutes, from the operation start and end
 * recorded in the completed Протокол операции.
 *
 * Returns null when either value is missing or malformed, or when the end is
 * earlier than the start (a data-entry error). Values do not wrap at 24 hours.
 */
export function operationDurationMinutes(
  startLocal: string | null | undefined,
  endLocal: string | null | undefined
): number | null {
  const start = toWallClockMinutes(startLocal);
  const end = toWallClockMinutes(endLocal);
  if (start === null || end === null) return null;

  const total = end - start;
  if (total < 0) return null;
  return total;
}

/**
 * Duration of an operation as "HH:mm", from the operation start and end
 * recorded in the completed Протокол операции.
 *
 * Returns null when either value is missing or malformed, or when the end is
 * earlier than the start (a data-entry error). Values do not wrap at 24 hours:
 * 26 h 10 min is "26:10". Equal start and end gives "00:00".
 */
export function formatOperationDuration(
  startLocal: string | null | undefined,
  endLocal: string | null | undefined
): string | null {
  const total = operationDurationMinutes(startLocal, endLocal);
  if (total === null) return null;

  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
