import { DateTime } from "luxon";

export const BAHRAIN_TZ = "Asia/Bahrain";

export function todayBahrainISODate() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

export function weekStartISODate(refISODate?: string) {
  const ref = refISODate
    ? DateTime.fromISO(refISODate, { zone: BAHRAIN_TZ })
    : DateTime.now().setZone(BAHRAIN_TZ);
  // start of week: Sunday (common in GCC). Luxon default is Monday in many locales.
  // We'll compute Sunday explicitly:
  const weekday = ref.weekday; // 1=Mon .. 7=Sun
  const daysSinceSunday = weekday % 7; // Sun->0, Mon->1, ...
  return ref.minus({ days: daysSinceSunday }).startOf("day").toISODate()!;
}

export function addDaysISODate(isoDate: string, days: number) {
  return DateTime.fromISO(isoDate, { zone: BAHRAIN_TZ }).plus({ days }).toISODate()!;
}

export function formatISODateHuman(isoDate: string) {
  return DateTime.fromISO(isoDate, { zone: BAHRAIN_TZ }).toFormat("ccc dd LLL");
}

export function toUTCISOForSlot(isoDate: string, timeHHMM: string) {
  // Create in Bahrain tz then convert to UTC ISO for DB
  const dt = DateTime.fromISO(`${isoDate}T${timeHHMM}`, { zone: BAHRAIN_TZ });
  return dt.toUTC().toISO({ suppressMilliseconds: true })!;
}
