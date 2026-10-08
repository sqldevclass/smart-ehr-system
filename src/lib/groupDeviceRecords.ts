/** Stable key of one physical device: its kind and where it sits (e.g. the insertion site). */
export const keyOf = (form_type: string, device_label: string | null) =>
  `${form_type}::${device_label ?? ""}`;

export interface DeviceGroup<R> {
  key: string;
  form_type: string;
  device_label: string | null;
  /** The earliest insertion date among the device's records. */
  inserted_at: string;
  /** The device's records in the order they came in (newest first). */
  entries: R[];
}

interface DeviceRecordLike {
  form_type: string;
  device_label: string | null;
  inserted_at: string;
}

/** Groups monitoring records (newest first) into devices; the newest record decides if one was removed. */
export function groupDeviceRecords<R extends DeviceRecordLike>(records: R[]): DeviceGroup<R>[] {
  const groups = new Map<string, DeviceGroup<R>>();
  for (const r of records) {
    const key = keyOf(r.form_type, r.device_label);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        key,
        form_type: r.form_type,
        device_label: r.device_label,
        inserted_at: r.inserted_at,
        entries: [r],
      });
    } else {
      group.entries.push(r);
      if (r.inserted_at && (!group.inserted_at || r.inserted_at < group.inserted_at)) {
        group.inserted_at = r.inserted_at;
      }
    }
  }
  return Array.from(groups.values());
}
