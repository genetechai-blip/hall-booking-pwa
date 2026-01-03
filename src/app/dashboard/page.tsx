import { DateTime } from "luxon";
import DashboardGrid from "./ui/DashboardGrid";
import { supabaseServer } from "@/lib/supabase/server";
import type { DashboardOccurrence, Hall, Slot } from "@/lib/types";

export const revalidate = 0;

const BAHRAIN_TZ = "Asia/Bahrain";

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function addDaysISO(iso: string, n: number) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).plus({ days: n }).toISODate()!;
}

function startOfWeekSundayISO(iso: string) {
  const ref = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("day");
  const weekday = ref.weekday; // 1=Mon .. 7=Sun
  const daysSinceSunday = weekday % 7; // Sun->0
  return ref.minus({ days: daysSinceSunday }).toISODate()!;
}

function monthGridStartISO(anchorISO: string) {
  const d = DateTime.fromISO(anchorISO, { zone: BAHRAIN_TZ }).startOf("month");
  return startOfWeekSundayISO(d.toISODate()!);
}

function monthGridRange(anchorISO: string) {
  const start = monthGridStartISO(anchorISO);
  const endExclusive = addDaysISO(start, 42);
  return { start, endExclusive };
}

function flattenOccurrence(row: any): DashboardOccurrence {
  const b = row?.bookings ?? null;

  const paymentAmount = typeof b?.payment_amount === "number" ? b.payment_amount : null;
  const amount = typeof b?.amount === "number" ? b.amount : null;

  return {
    id: row.id,

    hall_id: Number(row.hall_id),
    slot_id: Number(row.slot_id),

    start_ts: row.start_ts,
    end_ts: row.end_ts,

    booking_id: Number(row.booking_id),

    booking_title: b?.title ?? null,
    booking_status: b?.status ?? null,
    booking_type: b?.booking_type ?? null,

    // fallback (للتوافق)
    title: b?.title ?? null,
    status: b?.status ?? null,
    kind: b?.booking_type ?? null,

    client_name: b?.client_name ?? null,
    client_phone: b?.client_phone ?? null,
    notes: b?.notes ?? null,

    created_by: b?.created_by ?? null,

    payment_amount: paymentAmount,
    amount,
    currency: b?.currency ?? null,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  const anchorDate =
    searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : isoToday();

  const { start, endExclusive } = monthGridRange(anchorDate);

  const supabase = await supabaseServer();

  const { data: hallsRaw } = await supabase
    .from("halls")
    .select("id,name")
    .order("id", { ascending: true });

  const halls: Hall[] = (hallsRaw || []).map((h: any) => ({
    id: Number(h.id),
    name: h.name,
  }));

  const { data: slotsRaw } = await supabase
    .from("time_slots")
    .select("id,code,name,start_time,end_time")
    .order("id", { ascending: true });

  const slots: Slot[] = (slotsRaw || []).map((s: any) => ({
    id: Number(s.id),
    code: (s.code ?? String(s.id)) as any,
    name: s.name,
    start_time: s.start_time,
    end_time: s.end_time,
  }));

  const startTS = DateTime.fromISO(start, { zone: BAHRAIN_TZ })
    .startOf("day")
    .toISO()!;
  const endTS = DateTime.fromISO(endExclusive, { zone: BAHRAIN_TZ })
    .startOf("day")
    .toISO()!;

  const { data: occRaw, error: occErr } = await supabase
    .from("booking_occurrences")
    .select(
      "id,hall_id,slot_id,start_ts,end_ts,booking_id,bookings:bookings(id,title,status,booking_type,client_name,client_phone,notes,created_by,payment_amount,amount,currency)"
    )
    .gte("start_ts", startTS)
    .lt("start_ts", endTS)
    .order("start_ts", { ascending: true });

  const occurrences: DashboardOccurrence[] = occErr
    ? []
    : (occRaw || []).map(flattenOccurrence);

  return (
    <DashboardGrid
      halls={halls}
      slots={slots}
      days={[]}
      start={start}
      anchorDate={anchorDate}
      occurrences={occurrences}
    />
  );
}
