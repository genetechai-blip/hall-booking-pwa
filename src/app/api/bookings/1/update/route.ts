export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";

type SlotCode = "morning" | "afternoon" | "night";
type BookingType = "death" | "mawlid" | "fatiha" | "wedding" | "special";
type BookingStatus = "hold" | "confirmed" | "cancelled";

type Body = {
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;

  status: BookingStatus;
  booking_type: BookingType;

  payment_amount?: number | null;
  currency?: string;

  event_start_date: string;
  event_days: number;
  pre_days: number;
  post_days: number;

  hall_ids: number[];
  slot_codes: SlotCode[];
};

function toUtcIsoFromLocalDayTime(dayISO: string, timeHHMMSS: string) {
  const dt = DateTime.fromISO(`${dayISO}T${timeHHMMSS}`, { zone: BAHRAIN_TZ });
  return dt.toUTC().toISO({ suppressMilliseconds: true })!;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const bookingId = Number(params.id);
  if (!Number.isFinite(bookingId)) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });

  const body = (await req.json()) as Body;

  if (!body.title?.trim()) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });
  if (!body.event_start_date) return NextResponse.json({ error: "EVENT_START_REQUIRED" }, { status: 400 });
  if (!Array.isArray(body.hall_ids) || body.hall_ids.length === 0)
    return NextResponse.json({ error: "HALL_REQUIRED" }, { status: 400 });
  if (!Array.isArray(body.slot_codes) || body.slot_codes.length === 0)
    return NextResponse.json({ error: "SLOT_REQUIRED" }, { status: 400 });

  const eventDays = Number(body.event_days ?? 1);
  const preDays = Number(body.pre_days ?? 0);
  const postDays = Number(body.post_days ?? 0);

  if (eventDays < 1 || eventDays > 30) return NextResponse.json({ error: "EVENT_DAYS_INVALID" }, { status: 400 });
  if (preDays < 0 || preDays > 10) return NextResponse.json({ error: "PRE_DAYS_INVALID" }, { status: 400 });
  if (postDays < 0 || postDays > 10) return NextResponse.json({ error: "POST_DAYS_INVALID" }, { status: 400 });

  // load slots
  const { data: allSlots, error: allSlotsErr } = await supabase
    .from("time_slots")
    .select("id,code,start_time,end_time")
    .order("id");
  if (allSlotsErr) return NextResponse.json({ error: allSlotsErr.message }, { status: 400 });

  const eventSlots = allSlots!.filter((s) => body.slot_codes.includes(s.code as any));
  if (eventSlots.length === 0) return NextResponse.json({ error: "NO_EVENT_SLOTS" }, { status: 400 });

  const payment_amount =
    body.payment_amount === undefined || body.payment_amount === null || body.payment_amount === ("" as any)
      ? null
      : Number(body.payment_amount);

  const currency = (body.currency ?? "BHD").toUpperCase();

  // 1) update booking header
  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      title: body.title.trim(),
      client_name: body.client_name ?? null,
      client_phone: body.client_phone ?? null,
      notes: body.notes ?? null,
      status: body.status,
      booking_type: body.booking_type,
      payment_amount,
      currency,

      event_start_date: body.event_start_date,
      event_days: eventDays,
      pre_days: preDays,
      post_days: postDays,

      hall_ids: body.hall_ids,
      event_slot_codes: body.slot_codes,
    })
    .eq("id", bookingId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // 2) delete old occurrences
  const { error: delErr } = await supabase.from("booking_occurrences").delete().eq("booking_id", bookingId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  // 3) insert new occurrences
  const occ: any[] = [];
  const eventStart = DateTime.fromISO(body.event_start_date, { zone: BAHRAIN_TZ }).startOf("day");
  const totalDays = preDays + eventDays + postDays;
  const overallStart = eventStart.minus({ days: preDays });

  for (let d = 0; d < totalDays; d++) {
    const day = overallStart.plus({ days: d });
    const dayISO = day.toISODate()!;

    let kind: "event" | "prep" | "cleanup" = "event";
    if (d < preDays) kind = "prep";
    else if (d >= preDays + eventDays) kind = "cleanup";

    const slotsToUse = kind === "event" ? eventSlots : allSlots;

    for (const hall_id of body.hall_ids) {
      for (const s of slotsToUse) {
        occ.push({
          booking_id: bookingId,
          hall_id,
          slot_id: s.id,
          start_ts: toUtcIsoFromLocalDayTime(dayISO, s.start_time),
          end_ts: toUtcIsoFromLocalDayTime(dayISO, s.end_time),
          kind,
        });
      }
    }
  }

  const { error: insErr } = await supabase.from("booking_occurrences").insert(occ);

  if (insErr) {
    const friendly = insErr.message.includes("prevent_hall_overlap")
      ? "تعارض: واحدة من الصالات محجوزة في نفس الفترة."
      : insErr.message;

    return NextResponse.json({ error: friendly }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
