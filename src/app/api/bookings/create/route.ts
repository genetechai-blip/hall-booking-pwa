export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";

type SlotCode = "morning" | "afternoon" | "night";

type Body = {
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  status?: "hold" | "confirmed" | "cancelled";
  payment_status?: "unpaid" | "deposit" | "paid";

  // الفعالية الأساسية
  event_start_date: string; // YYYY-MM-DD
  event_days: number; // 1..30

  // أيام حجز إضافية للتجهيز/التنظيف
  pre_days?: number; // 0..10
  post_days?: number; // 0..10

  // الصالات والفترات (تطبق على الفعالية وأيام التجهيز/التنظيف كذلك)
  hall_ids: number[];
  slot_codes: SlotCode[];
};

export async function POST(req: Request) {
  const supabase = supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const body = (await req.json()) as Body;

  // validations
  if (!body.title?.trim()) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });
  if (!body.event_start_date) return NextResponse.json({ error: "EVENT_START_REQUIRED" }, { status: 400 });

  const eventDays = Number(body.event_days ?? 1);
  const preDays = Number(body.pre_days ?? 0);
  const postDays = Number(body.post_days ?? 0);

  if (eventDays < 1 || eventDays > 30) return NextResponse.json({ error: "EVENT_DAYS_INVALID" }, { status: 400 });
  if (preDays < 0 || preDays > 10) return NextResponse.json({ error: "PRE_DAYS_INVALID" }, { status: 400 });
  if (postDays < 0 || postDays > 10) return NextResponse.json({ error: "POST_DAYS_INVALID" }, { status: 400 });

  if (!Array.isArray(body.hall_ids) || body.hall_ids.length === 0)
    return NextResponse.json({ error: "HALL_REQUIRED" }, { status: 400 });

  if (!Array.isArray(body.slot_codes) || body.slot_codes.length === 0)
    return NextResponse.json({ error: "SLOT_REQUIRED" }, { status: 400 });

  // fetch slots
  const { data: slots, error: slotsErr } = await supabase
    .from("time_slots")
    .select("id,code,start_time,end_time")
    .in("code", body.slot_codes);

  if (slotsErr) return NextResponse.json({ error: slotsErr.message }, { status: 400 });
  if (!slots || slots.length === 0) return NextResponse.json({ error: "NO_SLOTS" }, { status: 400 });

  // create booking header with event info
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert({
      title: body.title.trim(),
      client_name: body.client_name ?? null,
      client_phone: body.client_phone ?? null,
      notes: body.notes ?? null,
      status: body.status ?? "hold",
      payment_status: body.payment_status ?? "unpaid",
      created_by: userData.user.id,

      event_start_date: body.event_start_date,
      event_days: eventDays,
      pre_days: preDays,
      post_days: postDays,
    })
    .select("id")
    .single();

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 400 });

  // build occurrences with kind
  const occ: any[] = [];
  const eventStart = DateTime.fromISO(body.event_start_date, { zone: BAHRAIN_TZ }).startOf("day");

  const totalDays = preDays + eventDays + postDays;
  const overallStart = eventStart.minus({ days: preDays });

  for (let d = 0; d < totalDays; d++) {
    const day = overallStart.plus({ days: d });
    const dayISO = day.toISODate()!;

    // determine kind
    let kind: "event" | "prep" | "cleanup" = "event";
    if (d < preDays) kind = "prep";
    else if (d >= preDays + eventDays) kind = "cleanup";

    for (const hall_id of body.hall_ids) {
      for (const s of slots) {
        const startLocal = DateTime.fromISO(`${dayISO}T${s.start_time}`, { zone: BAHRAIN_TZ });
        const endLocal = DateTime.fromISO(`${dayISO}T${s.end_time}`, { zone: BAHRAIN_TZ });

        occ.push({
          booking_id: booking.id,
          hall_id,
          slot_id: s.id,
          start_ts: startLocal.toUTC().toISO({ suppressMilliseconds: true }),
          end_ts: endLocal.toUTC().toISO({ suppressMilliseconds: true }),
          kind,
        });
      }
    }
  }

  const { error: occErr } = await supabase.from("booking_occurrences").insert(occ);

  if (occErr) {
    await supabase.from("bookings").delete().eq("id", booking.id);

    const friendly = occErr.message.includes("prevent_hall_overlap")
      ? "تعارض: واحدة من الصالات محجوزة في نفس الفترة."
      : occErr.message;

    return NextResponse.json({ error: friendly }, { status: 409 });
  }

  return NextResponse.json({ ok: true, booking_id: booking.id });
}
