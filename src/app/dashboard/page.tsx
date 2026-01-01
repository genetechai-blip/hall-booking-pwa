import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";
import DashboardGrid from "./ui/DashboardGrid";

const BAHRAIN_TZ = "Asia/Bahrain";

function isoTodayBH() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function weekStart(isoDate: string) {
  const d = DateTime.fromISO(isoDate, { zone: BAHRAIN_TZ }).startOf("day");
  // week starts Sunday
  const weekday = d.weekday; // Mon=1..Sun=7
  const daysFromSun = weekday === 7 ? 0 : weekday; // Sun ->0, Mon->1 ...
  return d.minus({ days: daysFromSun }).toISODate()!;
}

function addDays(isoDate: string, days: number) {
  return DateTime.fromISO(isoDate, { zone: BAHRAIN_TZ }).plus({ days }).toISODate()!;
}

export default async function DashboardPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const anchorDate = searchParams.date || isoTodayBH();
  const start = weekStart(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  // Fetch halls & slots
  const [{ data: halls }, { data: slots }] = await Promise.all([
    supabase.from("halls").select("id,name").order("id"),
    supabase.from("time_slots").select("id,code,name,start_time,end_time").order("id"),
  ]);

  // current user profile name
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  // Range: month around anchor (for monthly view) + buffer
  const anchor = DateTime.fromISO(anchorDate, { zone: BAHRAIN_TZ }).startOf("day");
  const monthStart = anchor.startOf("month").minus({ days: 7 });
  const monthEnd = anchor.endOf("month").plus({ days: 7 });

  const rangeStartUtc = monthStart.toUTC().toISO()!;
  const rangeEndUtc = monthEnd.plus({ days: 1 }).toUTC().toISO()!; // exclusive end

  const { data: occurrences, error: occErr } = await supabase
    .from("booking_occurrences")
    .select(
      `
      id, booking_id, hall_id, slot_id, start_ts, end_ts, kind,
      bookings (
        id, title, client_name, client_phone, notes, status, payment_status, created_by,
        event_start_date, event_days, pre_days, post_days,
        profiles ( full_name )
      )
    `
    )
    .gte("start_ts", rangeStartUtc)
    .lt("start_ts", rangeEndUtc);

  if (occErr) {
    // fallback: show empty
    return (
      <div className="container">
        <div className="card">خطأ في تحميل الحجوزات: {occErr.message}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>جدول الحجوزات</h2>
          <div className="small muted" style={{ marginTop: 6 }}>
            {myProfile?.full_name ? `مستخدم: ${myProfile.full_name}` : "مستخدم: (بدون اسم)"} •{" "}
            <Link href="/settings" className="small">تعديل الاسم</Link>
          </div>
        </div>

        <div className="row">
          <Link className="btn primary" href="/bookings/new">+ إضافة حجز</Link>
          <Link className="btn" href="/api/auth/signout">خروج</Link>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <DashboardGrid
          halls={halls ?? []}
          slots={slots ?? []}
          days={days}
          start={start}
          occurrences={(occurrences ?? []) as any}
        />
      </div>
    </div>
  );
}
