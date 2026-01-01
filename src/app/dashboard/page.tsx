import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { weekStartISODate, addDaysISODate, formatISODateHuman, todayBahrainISODate } from "@/lib/time";
import DashboardGrid from "./ui/DashboardGrid";
import SignOutButton from "./ui/SignOutButton";
import type { Hall, Slot, OccurrenceRow } from "@/lib/types";

export default async function DashboardPage({ searchParams }: { searchParams?: { start?: string } }) {
  const supabase = supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    // middleware should redirect, but just in case
    return null;
  }

  const start = weekStartISODate(searchParams?.start || todayBahrainISODate());
  const days = Array.from({ length: 7 }, (_, i) => addDaysISODate(start, i));

  const { data: halls } = await supabase.from("halls").select("id,name").order("id");
  const { data: slots } = await supabase.from("time_slots").select("id,code,name,start_time,end_time").order("id");

  // get occurrences for the week range (start 00:00 Bahrain -> end+7 00:00 Bahrain in UTC)
  // We'll just query by start_ts between [start, start+7days) in UTC by converting start day boundaries.
  // Simpler: compute UTC ISO for day start/end using Luxon on client? We'll do on server with JS Date is UTC,
  // but we already have ISO date; DB has timestamptz; use >= startDate and < startDate+7 by casting date in SQL is extra.
  // We'll pull a bit wider (7 days) using start_ts text comparison works because ISO.
  const startISO = `${start}T00:00:00.000Z`;
  const endISO = `${addDaysISODate(start, 7)}T00:00:00.000Z`;

  const { data: occ, error: occErr } = await supabase
    .from("booking_occurrences")
    .select("id,hall_id,slot_id,start_ts,end_ts,booking_id, bookings:bookings(id,title,status,payment_status,client_name,client_phone,notes,created_at,created_by)")
    .gte("start_ts", startISO)
    .lt("start_ts", endISO)
    .order("hall_id")
    .order("start_ts");

  const safeHalls = (halls || []) as Hall[];
  const safeSlots = (slots || []) as Slot[];
  const safeOcc = ((occ || []) as unknown as OccurrenceRow[]);

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>جدول الحجوزات</h2>
          <div className="muted small" style={{ marginTop: 6 }}>
            الأسبوع يبدأ: <span className="badge">{formatISODateHuman(days[0])}</span>
          </div>
        </div>
        <div className="row">
          <Link className="btn primary" href="/bookings/new">+ إضافة حجز</Link>
          <SignOutButton />
        </div>
      </div>

      {occErr && (
        <div className="card" style={{ marginTop: 12, borderColor: "#ffd6d6", background: "#fff5f5" }}>
          <div className="small" style={{ color: "#b00020" }}>{occErr.message}</div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <DashboardGrid halls={safeHalls} slots={safeSlots} days={days} occurrences={safeOcc} start={start} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="small muted">
          ملاحظة: منع التعارض يتم من قاعدة البيانات تلقائياً. إذا صار تعارض، النظام بيرفض الحجز برسالة واضحة.
        </div>
      </div>
    </main>
  );
}
