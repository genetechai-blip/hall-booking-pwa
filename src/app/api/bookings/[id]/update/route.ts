import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BAHRAIN_TZ = "Asia/Bahrain";

function toUtcIsoFromLocalDayTime(dayISO: string, timeHHMMSS: string) {
  const dt = DateTime.fromISO(`${dayISO}T${timeHHMMSS}`, { zone: BAHRAIN_TZ });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO({ suppressMilliseconds: true });
}

function addDaysISO(dayISO: string, days: number) {
  return DateTime.fromISO(dayISO, { zone: BAHRAIN_TZ })
    .plus({ days })
    .toISODate()!;
}

function parseIntSafe(v: any, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeIds(arr: any): number[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeStrings(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v).trim()).filter(Boolean);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseServer();

  const bookingId = Number(params.id);
  if (!Number.isFinite(bookingId)) {
    return NextResponse.json({ error: "BAD_ID" }, { status: 400 });
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await req.json()) as any;

  // اقرأ الحجز الحالي (عشان ما نمسح بياناته لو ما جتنا من الفورم)
  const { data: existing, error: exErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const title = String(body.title ?? body.booking_title ?? body.bookingTitle ?? existing.title ?? "").trim();

  const startDateISO = String(
    body.start_date ??
      body.event_start_date ??
      body.event_date ??
      body.date ??
      existing.event_start_date ??
      ""
  ).trim();

  const bookingType = String(
    body.kind ?? body.booking_type ?? body.type ?? existing.booking_type ?? "special"
  ).trim();

  const status = String(
    body.status ?? body.booking_status ?? existing.status ?? "hold"
  ).trim();

  const eventDays = parseIntSafe(body.days ?? body.event_days ?? existing.event_days, 1);
  const preDays = parseIntSafe(body.prep_days_before ?? body.pre_days ?? body.before_days ?? existing.pre_days, 0);
  const postDays = parseIntSafe(body.cleanup_days_after ?? body.post_days ?? body.after_days ?? existing.post_days, 0);

  // هذي أهم نقطتين: لو الفورم ما رجّعهم، لا نصفرهم — ناخذهم من الموجود
  const hallIdsIncoming = normalizeIds(body.hall_ids ?? body.hallIds);
  const hallIds: number[] =
    hallIdsIncoming.length > 0
      ? hallIdsIncoming
      : Array.isArray(existing.hall_ids)
        ? existing.hall_ids.map((x: any) => Number(x)).filter(Number.isFinite)
        : [];

  const slotIdsIn = normalizeIds(body.slot_ids ?? body.slotIds);
  const slotCodesIn = normalizeStrings(body.slot_codes ?? body.slotCodes);

  const existingCodes: string[] = Array.isArray(existing.event_slot_codes)
    ? existing.event_slot_codes.map((x: any) => String(x))
    : [];

  const paymentAmountRaw = body.payment_amount ?? body.amount ?? body.payment ?? existing.payment_amount ?? null;
  const paymentAmount =
    paymentAmountRaw === null || paymentAmountRaw === undefined || paymentAmountRaw === ""
      ? null
      : Number(paymentAmountRaw);

  const currency = String(body.currency ?? existing.currency ?? "BHD").trim() || "BHD";
  const clientName = String(body.client_name ?? body.clientName ?? existing.client_name ?? "").trim() || null;
  const clientPhone = String(body.client_phone ?? body.clientPhone ?? existing.client_phone ?? "").trim() || null;
  const notes = String(body.notes ?? existing.notes ?? "").trim() || null;

  // Missing fields list (واضحة)
  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!startDateISO) missing.push("start_date");
  if (hallIds.length === 0) missing.push("hall_ids");
  if (!Number.isFinite(eventDays) || eventDays < 1) missing.push("days");
  if (!Number.isFinite(preDays) || preDays < 0) missing.push("prep_days_before");
  if (!Number.isFinite(postDays) || postDays < 0) missing.push("cleanup_days_after");

  if (missing.length) {
    return NextResponse.json({ error: "MISSING_FIELDS", missing }, { status: 400 });
  }

  // Fetch slots
  const { data: allSlots, error: slotsErr } = await supabase
    .from("time_slots")
    .select("id, code, start_time, end_time")
    .order("id", { ascending: true });

  if (slotsErr || !allSlots || allSlots.length === 0) {
    return NextResponse.json({ error: "NO_TIME_SLOTS" }, { status: 500 });
  }

  const slotByCode = new Map<string, any>();
  const slotById = new Map<number, any>();
  for (const s of allSlots) {
    slotByCode.set(String(s.code), s);
    slotById.set(Number(s.id), s);
  }

  // حدّد فترات الحدث: من slot_ids / slot_codes / أو fallback من الحجز القديم
  const selectedSlotIds = new Set<number>();
  for (const id of slotIdsIn) if (slotById.has(id)) selectedSlotIds.add(id);

  const codesToUse = slotCodesIn.length ? slotCodesIn : existingCodes;
  if (selectedSlotIds.size === 0) {
    for (const c of codesToUse) {
      const s = slotByCode.get(c);
      if (s?.id) selectedSlotIds.add(Number(s.id));
    }
  }

  if (selectedSlotIds.size === 0) {
    return NextResponse.json(
      { error: "MISSING_FIELDS", missing: ["slot_ids"] },
      { status: 400 }
    );
  }

  const eventSlots = allSlots.filter((s) => selectedSlotIds.has(Number(s.id)));
  const eventSlotCodes = eventSlots.map((s) => String(s.code));

  // Update booking row
  const { error: upErr } = await supabase
    .from("bookings")
    .update({
      title,
      client_name: clientName,
      client_phone: clientPhone,
      notes,
      status,
      booking_type: bookingType,
      payment_amount: Number.isFinite(paymentAmount as any) ? paymentAmount : null,
      currency,
      event_start_date: startDateISO,
      event_days: eventDays,
      pre_days: preDays,
      post_days: postDays,
      hall_ids: hallIds,
      event_slot_codes: eventSlotCodes,
    })
    .eq("id", bookingId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // rebuild occurrences
  const totalDays = preDays + eventDays + postDays;
  const firstDayISO = addDaysISO(startDateISO, -preDays);

  const occRows: any[] = [];
  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const dayISO = addDaysISO(firstDayISO, dayIndex);

    const kind =
      dayIndex < preDays ? "prep" : dayIndex < preDays + eventDays ? "event" : "cleanup";

    const slotsForDay = kind === "event" ? eventSlots : allSlots;

    for (const hallId of hallIds) {
      for (const slot of slotsForDay) {
        const st = toUtcIsoFromLocalDayTime(dayISO, String(slot.start_time ?? ""));
        const en0 = toUtcIsoFromLocalDayTime(dayISO, String(slot.end_time ?? ""));

        if (!st || !en0) {
          return NextResponse.json(
            {
              error: "INVALID_SLOT_TIME",
              detail: {
                day: dayISO,
                slot_id: slot.id,
                start_time: slot.start_time,
                end_time: slot.end_time,
              },
            },
            { status: 400 }
          );
        }

        // لو end <= start معناها الفترة تعدي منتصف الليل
        const sDT = DateTime.fromISO(st);
        const eDT0 = DateTime.fromISO(en0);
        const en = eDT0 <= sDT ? eDT0.plus({ days: 1 }).toUTC().toISO({ suppressMilliseconds: true }) : en0;

        occRows.push({
          booking_id: bookingId,
          hall_id: hallId,
          slot_id: Number(slot.id),
          kind,
          start_ts: st,
          end_ts: en,
        });
      }
    }
  }

  // delete then insert
  const { error: delErr } = await supabase
    .from("booking_occurrences")
    .delete()
    .eq("booking_id", bookingId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase
    .from("booking_occurrences")
    .insert(occRows);

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
