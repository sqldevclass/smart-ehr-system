// Operating room (Операционный блок) utilization for the Quality reports:
// operations per room and their total duration against the room's available
// working time (business days x 8 hours) in the report period.
import { operationDurationMinutes } from "/dev-server/src/lib/operationDuration";
import { addDaysToKey } from "/dev-server/src/lib/physicianDailyNotes";

export const SURG_START_DATETIME_FIELD_ID = "b1000000-0000-0000-0000-000000000124";
export const SURG_END_DATETIME_FIELD_ID = "b1000000-0000-0000-0000-000000000125";
export const SURG_OPERATING_BLOCK_FIELD_ID = "b1000000-0000-0000-0000-000000000122";

const CAPACITY_HOURS_PER_DAY = 8;

// Business days (Mon..Fri) between two "yyyy-MM-dd" keys, inclusive. No
// holiday calendar; 0 when toKey < fromKey. UTC-based, no local-time parsing.
export function countBusinessDays(fromKey: string, toKey: string): number {
  if (toKey < fromKey) return 0;
  let n = 0;
  for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) {
    const [y, m, d] = k.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) n++;
  }
  return n;
}

// 90 -> "1 ч 30 мин", 0 -> "0 ч 0 мин".
export function formatMinutesRu(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours} ч ${mins} мин`;
}

export interface UtilizationRoom {
  id: string;
  name: string;
  isActive: boolean;
}

export interface UtilizationOperation {
  documentId: string;
  roomValue: string | null;
  startLocal: string | null;
  endLocal: string | null;
}

export interface RoomUtilizationRow {
  roomId: string;
  name: string;
  surgeries: number;
  minutes: number;
  capacityMinutes: number;
  utilization: number | null;
}

export interface UtilizationAggregate {
  surgeries: number;
  minutes: number;
  capacityMinutes: number;
  utilization: number | null;
}

export interface RoomUtilizationResult {
  rows: RoomUtilizationRow[];
  average: UtilizationAggregate;
  total: UtilizationAggregate;
  unassigned: { surgeries: number; minutes: number } | null;
  businessDays: number;
  capacityMinutes: number;
  withoutDuration: number;
}

export function buildRoomUtilization(args: {
  rooms: UtilizationRoom[];
  operations: UtilizationOperation[];
  fromKey: string;
  toKey: string;
}): RoomUtilizationResult {
  const { rooms, operations, fromKey, toKey } = args;

  const businessDays = countBusinessDays(fromKey, toKey);
  const capacityMinutes = businessDays * CAPACITY_HOURS_PER_DAY * 60;

  const minutesByRoom = new Map<string, { surgeries: number; minutes: number }>();
  let unassignedSurgeries = 0;
  let unassignedMinutes = 0;
  let withoutDuration = 0;

  for (const op of operations) {
    const minutes = operationDurationMinutes(op.startLocal, op.endLocal);
    if (minutes === null) withoutDuration++;
    const room = op.roomValue ? rooms.find((r) => r.id === op.roomValue) : undefined;
    if (room) {
      const entry = minutesByRoom.get(room.id) ?? { surgeries: 0, minutes: 0 };
      entry.surgeries++;
      entry.minutes += minutes ?? 0;
      minutesByRoom.set(room.id, entry);
    } else {
      unassignedSurgeries++;
      unassignedMinutes += minutes ?? 0;
    }
  }

  // Listed rooms: all active ones, plus inactive ones that have operations.
  const listed = rooms.filter((r) => r.isActive || (minutesByRoom.get(r.id)?.surgeries ?? 0) > 0);

  const rows: RoomUtilizationRow[] = listed.map((room) => {
    const entry = minutesByRoom.get(room.id) ?? { surgeries: 0, minutes: 0 };
    return {
      roomId: room.id,
      name: room.name,
      surgeries: entry.surgeries,
      minutes: entry.minutes,
      capacityMinutes,
      utilization: capacityMinutes > 0 ? entry.minutes / capacityMinutes : null,
    };
  });

  const count = rows.length;
  const totalSurgeries = rows.reduce((s, r) => s + r.surgeries, 0);
  const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
  const totalCapacity = capacityMinutes * count;

  const average: UtilizationAggregate = {
    surgeries: count > 0 ? totalSurgeries / count : 0,
    minutes: count > 0 ? Math.round(totalMinutes / count) : 0,
    capacityMinutes,
    utilization: capacityMinutes > 0 && count > 0 ? totalMinutes / count / capacityMinutes : null,
  };

  const total: UtilizationAggregate = {
    surgeries: totalSurgeries,
    minutes: totalMinutes,
    capacityMinutes: totalCapacity,
    utilization: totalCapacity > 0 ? totalMinutes / totalCapacity : null,
  };

  return {
    rows,
    average,
    total,
    unassigned: unassignedSurgeries > 0 ? { surgeries: unassignedSurgeries, minutes: unassignedMinutes } : null,
    businessDays,
    capacityMinutes,
    withoutDuration,
  };
}
