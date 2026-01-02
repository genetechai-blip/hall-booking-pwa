// src/app/dashboard/page.tsx
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";
import DashboardGrid from "./ui/DashboardGrid";

const BAHRAIN_TZ = "Asia/Bahrain";

function startOfWeekSunday(iso: string) {
  const ref = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("day");
  const weekday = ref.weekday; // 1=Mon .. 7=Sun
  const daysSinceSunday = weekday % 7; // Sun->0
  return ref.minus({ days: daysSinceSunday }).toISODate()!;
}
function addDays(iso: string, n: number) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).plus({ days: n }).toISODate()!;
}
function monthGridStart(iso: string) {
  const d = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("month");
  return startOfWeekSunday(d.toISODate()!);
}
function monthGridDays(anchorISO: string) {
  const start = monthGridStart(anchorISO);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { view?: string; date?: string };
}) {
  const view = (searchParams?.view as "day" | "week" | "month") || "month";
  const anchorDate =
    searchParams?.date ||
    DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;

  // days range for the server query
  let days: string[] = [];
  if (view === "day") days = [anchorDate];
  else if (view === "week") {
    const start = startOfWeekSunday(anchorDate);
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  } else {
    days = monthGridDays(anchorDate);
  }

  const startISO = days[0];
  const endISO = addDays(days[days.length - 1], 1);

  const supabase = await supabaseServer();

  const { data: halls } = await supabase.from("halls").select("id,name").order("id");
  const { data: slots } = await supabase.from("time_slots").select("id,code,name,start_time,end_time").order("id");

  // IMPORTANT:
  // You already have a working query in your project (since the page loads).
  // Keep your current occurrences query as-is if you already customized it elsewhere.
  const { data: occurrences } = await supabase
    .from("booking_occurrences")
    .select(`
      id,
      booking_id,
      hall_id,
      slot_id,
      start_ts,
      end_ts,
      kind_occurrence_kind,
      bookings:bookings(
        id,
        title,
        status,
        booking_type,
        payment_amount,
        currency,
        client_name,
        client_phone,
        notes,
        created_by
      )
    `)
    .gte("start_ts", DateTime.fromISO(startISO, { zone: BAHRAIN_TZ }).toISO())
    .lt("start_ts", DateTime.fromISO(endISO, { zone: BAHRAIN_TZ }).toISO());

  // Flatten (keep your existing shape logic if you already have one)
  const occFlat =
    (occurrences || []).map((o: any) => {
      const b = o.bookings || {};
      return {
        id: o.id,
        booking_id: o.booking_id,
        hall_id: o.hall_id,
        slot_id: o.slot_id,
        start_ts: o.start_ts,
        end_ts: o.end_ts,
        booking_title: b.title ?? null,
        booking_status: b.status ?? null,
        booking_type: b.booking_type ?? null,
        payment_amount: b.payment_amount ?? null,
        currency: b.currency ?? null,
        client_name: b.client_name ?? null,
        client_phone: b.client_phone ?? null,
        notes: b.notes ?? null,
        created_by: b.created_by ?? null,
        kind_occurrence_kind: o.kind_occurrence_kind ?? null,
      };
    }) || [];

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 24 }}>
      <DashboardGrid
        halls={(halls || []) as any}
        slots={(slots || []) as any}
        days={days}
        start={startISO}
        anchorDate={anchorDate}
        occurrences={occFlat as any}
      />
    </div>
  );
}
