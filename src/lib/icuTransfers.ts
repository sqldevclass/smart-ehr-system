import { localDayKey } from "@/lib/physicianDailyNotes";

export const ICU_DEPARTMENT_CODE = "icu";
export const TRANSFER_SUMMARY_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000017";
export const OPERATION_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000011";
export const POSTOP_DESTINATION_FIELD_ID = "f1000000-0000-0000-0000-000000000019";
export const SURG_END_DATETIME_FIELD_ID = "b1000000-0000-0000-0000-000000000125";
export const EPICRISIS_LOOKBACK_HOURS = 24;

export interface DeptStay {
  hospitalizationId: string;
  departmentId: string;
  departmentName: string;
  enteredAt: string;
  leftAt: string | null;
  hospitalizationNumber?: string | null;
  patientName?: string;
  patientNumber?: string | null;
}

export interface ProtocolInfo {
  hospitalizationId: string;
  createdAt: string;
  endLocal: string | null;
  destination: string | null;
}

export interface TransferDoc {
  hospitalizationId: string;
  createdAt: string;
  status: string;
}

export interface IcuTransferRow {
  hospitalizationId: string;
  hospitalizationNumber: string | null;
  patientName: string;
  patientNumber: string | null;
  fromDepartment: string;
  enteredAt: string;
  leftAt: string | null;
  entryNumber: number;
  isReturn: boolean;
  returnHours: number | null;
  epicrisis: "yes" | "draft" | "no";
  epicrisisAt: string | null;
}

interface BuildOptions {
  stays: DeptStay[];
  protocols: ProtocolInfo[];
  docs: TransferDoc[];
  icuDepartmentId: string;
  tz: string;
  now: Date;
  from: Date;
  to: Date;
}

export function buildIcuTransfers({ stays, protocols, docs, icuDepartmentId, tz, now, from, to }: BuildOptions) {
  const byHospitalization = new Map<string, DeptStay[]>();
  for (const stay of stays) {
    const group = byHospitalization.get(stay.hospitalizationId) ?? [];
    group.push(stay);
    byHospitalization.set(stay.hospitalizationId, group);
  }
  const rows: IcuTransferRow[] = [];
  let excludedPlanned = 0;
  for (const [hospitalizationId, history] of byHospitalization) {
    history.sort((a, b) => Date.parse(a.enteredAt) - Date.parse(b.enteredAt));
    let prevIcu: DeptStay | undefined;
    let entryNumber = 0;
    for (let i = 0; i < history.length; i++) {
      const stay = history[i];
      if (stay.departmentId !== icuDepartmentId) continue;
      entryNumber++;
      const earlierIcu = prevIcu;
      prevIcu = stay;
      const previous = history[i - 1];
      const entered = Date.parse(stay.enteredAt);
      if (!previous || previous.departmentId === icuDepartmentId || entered < from.getTime() || entered > to.getTime()) continue;

      const entryDay = localDayKey(stay.enteredAt, tz);
      const planned = protocols.some((p) =>
        p.hospitalizationId === hospitalizationId && p.destination === "icu" &&
        (p.endLocal ? p.endLocal.slice(0, 10) : localDayKey(p.createdAt, tz)) === entryDay
      );
      if (planned) {
        excludedPlanned++;
        continue;
      }
      const start = Math.max(entered - EPICRISIS_LOOKBACK_HOURS * 3600000, earlierIcu?.leftAt ? Date.parse(earlierIcu.leftAt) : -Infinity);
      const end = stay.leftAt ? Date.parse(stay.leftAt) : now.getTime();
      const inWindow = docs.filter((d) => d.hospitalizationId === hospitalizationId && Date.parse(d.createdAt) >= start && Date.parse(d.createdAt) <= end);
      const completed = inWindow.filter((d) => d.status === "completed");
      const drafts = inWindow.filter((d) => d.status === "preliminary");
      const matching = completed.length ? completed : drafts;
      matching.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      rows.push({
        hospitalizationId,
        hospitalizationNumber: stay.hospitalizationNumber ?? null,
        patientName: stay.patientName ?? "",
        patientNumber: stay.patientNumber ?? null,
        fromDepartment: previous.departmentName,
        enteredAt: stay.enteredAt,
        leftAt: stay.leftAt,
        entryNumber,
        isReturn: !!earlierIcu,
        returnHours: earlierIcu?.leftAt ? (entered - Date.parse(earlierIcu.leftAt)) / 3600000 : null,
        epicrisis: completed.length ? "yes" : drafts.length ? "draft" : "no",
        epicrisisAt: matching[0]?.createdAt ?? null,
      });
    }
  }
  rows.sort((a, b) => Date.parse(b.enteredAt) - Date.parse(a.enteredAt));
  return { rows, excludedPlanned };
}