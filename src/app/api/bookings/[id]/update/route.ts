export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";

const BAHRAIN_TZ = "Asia/Bahrain";

type UpdatePayload = {
  title: string;

  // booking core
  event_start_date: string; // YYYY-MM-DD
  event_days: number; // 1..N
  pre_days: number; // 0..N (التجهيز)
  post_days: number; // 0..N (التنظيف)

  // selection
  hall_ids: number[];
  slot_codes: string[]; // e.g. ["morning","afternoon","night"]

  // metadata
  booking_type?: string | null;
  booking_status?: string | null;

  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;

  payment_amount?: number | null;
  currency?: string | null;
};

function toUtcIsoFromLocalDayTime(dayISO: string, timeHHMMSS: string) {
  // dayISO/time is in Bahrain local time, convert to UTC ISO for DB
  return DateTime.fromISO(`${dayISO}T${timeHHMMSS}`, {
    zone: BAHRAIN_TZ,
  }).toUTC().toISO()!;
}

export async function POST(
  req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const bookingId = Number(ctx.params.id);
    if (!Number.isFinite(bookingId)) {
      return NextResponse.json({ error: "invalid booking id" }, { status: 400 });
    }

    const supabase = supabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<UpdatePayload>;

    // ---- Normalize + validate ----
    const title = (body.title ?? "").trim();
    const event_start_date = (body.event_start_date ?? "").trim();

    const event_days = Number(body.event_days);
    const pre_days = Number(body.pre_days ?? 0);
    const post_days = Number(body.post_days ?? 0);

    const hall_ids = Array.isArray(body.hall_ids)
      ? body.hall_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      : [];
    const slot_codes = Array.isArray(body.slot_codes)
      ? body.slot_codes.map((x) => String(x)).filter(Boolean)
      : [];

    const missing: string[] = [];
    if (!title) missing.push("عنوان الحجز");
    if (!event_start_date) missing.push("تاريخ البداية");
    if (!Number.isFinite(event_days) || event_days <= 0) missing.push("عدد الأيام");
    if (!Number.isFinite(pre_days) || pre_days < 0) missing.push("التجهيز");
    if (!Number.isFinite(post_days) || post_days < 0) missing.push("التنظيف");
    if (hall_ids.length === 0) missing.push("الصالات");
    if (slot_codes.length === 0) missing.push("الفترات");

    if (missing.length > 0) {
      return NextResponse.json({ error: "missing_fields", missing }, { status: 400 });
    }

    // keep created_by stable for occurrences
    const { data: oldBooking, error: oldErr } = await supabase
      .from("bookings")
      .select("id,created_by")
      .eq("id", bookingId)
      .maybeSingle();

    if (oldErr || !oldBooking) {
      return NextResponse.json(
        { error: "booking not found" },
        { status: 404 }
      );
    }

    // ---- Update booking ----
    const { error: updErr } = await supabase
      .from("bookings")
      .update({
        title,
        event_start_date,
        event_days,
        pre_days,
        post_days,
        hall_ids,
        event_slot_codes: slot_codes,

        booking_type: body.booking_type ?? null,
        booking_status: body.booking_status ?? null,

        client_name: body.client_name ?? null,
        client_phone: body.client_phone ?? null,
        notes: body.notes ?? null,

        payment_amount: typeof body.payment_amount === "number" ? body.payment_amount : null,
        currency: body.currency ?? null,

        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    // ---- Fetch slots by code ----
    const { data: slots, error: slotsErr } = await supabase
      .from("time_slots")
      .select("id,code,start_time,end_time")
      .in("code", slot_codes);

    if (slotsErr || !slots || slots.length === 0) {
      return NextResponse.json(
        { error: "time_slots not found" },
        { status: 400 }
      );
    }

    // ---- Replace occurrences ----
    const { error: delErr } = await supabase
      .from("booking_occurrences")
      .delete()
      .eq("booking_id", bookingId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    const totalDays = pre_days + event_days + post_days;
    const occurrences: any[] = [];

    for (let d = 0; d < totalDays; d++) {
      const dayISO = DateTime.fromISO(event_start_date, { zone: BAHRAIN_TZ })
        .plus({ days: d - pre_days })
        .toISODate()!;

      for (const hallId of hall_ids) {
        for (const sc of slot_codes) {
          const slot = slots.find((x) => x.code === sc);
          if (!slot) continue;

          const startISO = toUtcIsoFromLocalDayTime(dayISO, slot.start_time);
          let endISO = toUtcIsoFromLocalDayTime(dayISO, slot.end_time);

          // if end <= start, it spills to next day
          const sDT = DateTime.fromISO(startISO);
          const eDT = DateTime.fromISO(endISO);
          if (eDT <= sDT) endISO = eDT.plus({ days: 1 }).toISO()!;

          occurrences.push({
            booking_id: bookingId,
            hall_id: hallId,
            slot_id: slot.id,
            start_ts: startISO,
            end_ts: endISO,

            title,
            kind: body.booking_type ?? null,
            status: body.booking_status ?? null,

            created_by: oldBooking.created_by ?? null,
          });
        }
      }
    }

    if (occurrences.length === 0) {
      return NextResponse.json(
        { error: "no occurrences built" },
        { status: 400 }
      );
    }

    const { error: insErr } = await supabase
      .from("booking_occurrences")
      .insert(occurrences);

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}
