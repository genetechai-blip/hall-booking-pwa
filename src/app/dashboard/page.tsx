// src/app/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import DashboardGrid from "./ui/DashboardGrid";
import { supabaseServer } from "@/lib/supabase/server";
import { BAHRAIN_TZ } from "@/lib/time";

type SearchParams = {
  view?: "day" | "week" | "month";
  date?: string;  // YYYY-MM-DD
  start?: string; // YYYY-MM-DD (للأسبوعي)
  hall?: string;
};

function IconButton({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 14,
        whiteSpace: "nowrap",
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </Link>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4.6a8.2 8.2 0 0 0-1.7-1L15 6h-6l-.4 2.6a8.2 8.2 0 0 0-1.7 1L4.5 9l-2 3.5 2 1.5a7.9 7.9 0 0 0 .1 1 7.9 7.9 0 0 0-.1 1l-2 1.5 2 3.5 2.4-.6c.5.4 1.1.7 1.7 1L9 22h6l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4.6 2-3.5-2-1.5c.1-.3.1-.6.1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M10 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sb = await supabaseServer();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/login");

  // profile
  const { data: myProfile } = await sb
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  const view = searchParams.view ?? "day";
  const today = DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
  const date = searchParams.date ?? today;
  const start = searchParams.start ?? date;

  // ✅ نحسب timestamps بدقة (ISO كامل) بدل نصوص يدويّة
  let rangeStart: DateTime;
  let rangeEnd: DateTime;
  let days: string[] = [];

  if (view === "week") {
    const s = DateTime.fromISO(start, { zone: BAHRAIN_TZ }).startOf("day");
    rangeStart = s;
    rangeEnd = s.plus({ days: 7 }); // نهاية الأسبوع (غير شاملة)
    days = Array.from({ length: 7 }, (_, i) => s.plus({ days: i }).toISODate()!);
  } else if (view === "month") {
    const ref = DateTime.fromISO(date, { zone: BAHRAIN_TZ });
    rangeStart = ref.startOf("month").startOf("day");
    rangeEnd = ref.plus({ months: 1 }).startOf("month").startOf("day");
    days = [date]; // المشهري يعتمد على date كمرجع
  } else {
    const d = DateTime.fromISO(date, { zone: BAHRAIN_TZ }).startOf("day");
    rangeStart = d;
    rangeEnd = d.plus({ days: 1 });
    days = [d.toISODate()!];
  }

  const rangeStartISO = rangeStart.toISO(); // مثال: 2026-01-15T00:00:00.000+03:00
  const rangeEndISO = rangeEnd.toISO();

  // halls + slots
  const [{ data: halls }, { data: slots }] = await Promise.all([
    sb.from("halls").select("id,name").order("id"),
    sb.from("time_slots").select("id,code,name,start_time,end_time").order("id"),
  ]);

  // occurrences + join bookings + join profiles (علشان الاسم)
  const { data: occurrences, error: occErr } = await sb
    .from("booking_occurrences")
    .select(
      `
      id, hall_id, slot_id, start_ts, end_ts, booking_id, kind,
      bookings:bookings (
        id, title, status, client_name, client_phone, notes,
        booking_type, amount, created_by,
        profiles:profiles ( full_name )
      )
    `
    )
    .gte("start_ts", rangeStartISO!)
    .lt("start_ts", rangeEndISO!)
    .order("start_ts", { ascending: true });

  // لو صار خطأ في السيرفر، خلّنا نطلع رسالة واضحة بدل صفحة فاضية
  if (occErr) {
    return (
      <div className="container" style={{ paddingTop: 12 }}>
        <div className="card" style={{ padding: 12, borderRadius: 18 }}>
          <strong>صار خطأ في جلب الحجوزات</strong>
          <div className="small muted" style={{ marginTop: 8 }}>
            {occErr.message}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            rangeStart: {rangeStartISO} <br />
            rangeEnd: {rangeEndISO}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* App Bar */}
      <div
        className="card"
        style={{
          padding: 12,
          borderRadius: 18,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>جدول الحجوزات</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              مستخدم: {myProfile?.full_name || "بدون اسم"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <IconButton href="/bookings/new" label="إضافة حجز">
              <PlusIcon />
              <span>إضافة حجز</span>
            </IconButton>

            <IconButton href="/settings" label="الإعدادات">
              <GearIcon />
              <span>الإعدادات</span>
            </IconButton>

            <IconButton href="/api/auth/signout" label="خروج">
              <LogoutIcon />
              <span>خروج</span>
            </IconButton>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ marginTop: 12 }}>
        <DashboardGrid
          halls={(halls ?? []) as any}
          slots={(slots ?? []) as any}
          days={days}
          start={view === "week" ? start : date}
          occurrences={(occurrences ?? []) as any}
        />
      </div>
    </div>
  );
}
