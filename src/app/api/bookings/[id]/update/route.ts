import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";

const BAHRAIN_TZ = "Asia/Bahrain";

type OccurrenceKind = "prep" | "event" | "cleanup";

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function pickString(...vals: any[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function toIntArray(v: any): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function toStrArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = supabaseServer();
  const id = Number(ctx.params.id);

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: "BAD_ID", message_ar: "معرّف الحجز غير صحيح." },
      { status: 400 }
    );
  }

  // auth (so created_by + RLS work as expected)
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message_ar: "الرجاء تسجيل الدخول أولاً." },
      { status: 401 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_JSON", message_ar: "بيانات الطلب غير صحيحة." },
      { status: 400 }
    );
  }

  const title = pickString(body.title, body.booking_title);
  const bookingType = pickString(body.booking_type, body.kind, body.type);
  const status = pickString(body.status, body.booking_status, body.bookingStatus) || "hold";

  const eventStartDate = pickString(
    body.event_start_date,
    body.eventStartDate,
    body.start_date,
    body.startDate,
    body.start
  );

  const eventDays = clampInt(body.event_days ?? body.eventDays ?? body.days_count ?? body.days ?? body.num_days, 1, 1, 60);
  const preDays = clampInt(body.pre_days ?? body.preDays ?? body.prep_days ?? body.before ?? body.setup, 0, 0, 60);
  const postDays = clampInt(body.post_days ?? body.postDays ?? body.clean_days ?? body.after ?? body.cleanup, 0, 0, 60);

  const hallIds = toIntArray(body.hall_ids ?? body.hallIds ?? body.halls);
  const slotIds = toIntArray(body.slot_ids ?? body.slotIds ?? body.slots);
  let slotCodes = toStrArray(body.event_slot_codes ?? body.slot_codes ?? body.slotCodes ?? body.eventSlotCodes);

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!eventStartDate) missing.push("event_start_date");
  if (!hallIds.length) missing.push("hall_ids");
  if (!slotIds.length && !slotCodes.length) missing.push("slot_ids/slot_codes");
  if (!bookingType) missing.push("booking_type");

  if (missing.length) {
    return NextResponse.json(
      {
        error: "MISSING_FIELDS",
        missing,
        message_ar: `بيانات ناقصة: ${missing.join(" , ")}`,
      },
      { status: 400 }
    );
  }

  const startDT = DateTime.fromISO(eventStartDate, { zone: BAHRAIN_TZ });
  if (!startDT.isValid) {
    return NextResponse.json(
      {
        error: "BAD_DATE",
        message_ar: "تاريخ البداية غير صحيح. لازم يكون بصيغة YYYY-MM-DD.",
      },
      { status: 400 }
    );
  }

  // slots lookup
  let timeSlotsRow: { id: number; code: string; start_time: string; end_time: string }[] = [];

  if (slotIds.length) {
    const { data, error } = await supabase
      .from("time_slots")
      .select("id,code,start_time,end_time")
      .in("id", slotIds);

    if (error || !data?.length) {
      return NextResponse.json(
        { error: "SLOT_LOOKUP_FAILED", message_ar: "تعذر جلب الفترات." },
        { status: 400 }
      );
    }
    timeSlotsRow = data as any;
    slotCodes = timeSlotsRow.map((r) => r.code);
  } else {
    const { data, error } = await supabase
      .from("time_slots")
      .select("id,code,start_time,end_time")
      .in("code", slotCodes);

    if (error || !data?.length || data.length !== slotCodes.length) {
      return NextResponse.json(
        { error: "SLOT_LOOKUP_FAILED", message_ar: "تعذر جلب الفترات." },
        { status: 400 }
      );
    }
    timeSlotsRow = data as any;
  }

  // update booking (matches your DB schema)
  const clientName = pickString(body.client_name, body.clientName, body.client_name_ar, body.customer_name);
  const clientPhone = pickString(body.client_phone, body.clientPhone, body.customer_phone);
  const notes = pickString(body.notes);
  const paymentAmount = body.payment_amount ?? body.paymentAmount ?? body.amount;
  const currency = pickString(body.currency) || "BHD";
  const paymentStatus = pickString(body.payment_status, body.paymentStatus) || undefined;

  const { error: upErr } = await supabase
    .from("bookings")
    .update({
      title,
      booking_type: bookingType,
      status,
      event_start_date: startDT.toISODate(),
      event_days: eventDays,
      pre_days: preDays,
      post_days: postDays,
      hall_ids: hallIds,
      event_slot_codes: slotCodes,
      client_name: clientName ? clientName : null,
      client_phone: clientPhone ? clientPhone : null,
      notes: notes ? notes : null,
      payment_amount:
        typeof paymentAmount === "number"
          ? paymentAmount
          : paymentAmount
            ? Number(paymentAmount)
            : null,
      currency,
      ...(paymentStatus ? { payment_status: paymentStatus } : {}),
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json(
      { error: upErr.message, message_ar: "فشل تحديث بيانات الحجز." },
      { status: 400 }
    );
  }

  // take a backup of existing occurrences to allow rollback if needed
  const { data: oldOccs } = await supabase
    .from("booking_occurrences")
    .select("hall_id, slot_id, start_ts, end_ts, kind")
    .eq("booking_id", id);

  // delete old occurrences (IMPORTANT)
  const { error: delErr } = await supabase
    .from("booking_occurrences")
    .delete()
    .eq("booking_id", id);

  if (delErr) {
    return NextResponse.json(
      { error: delErr.message, message_ar: "فشل حذف تفاصيل الحجز القديمة." },
      { status: 400 }
    );
  }

  // rebuild occurrences
  const allSlotIds = timeSlotsRow.map((x) => x.id);
  const baseStart = startDT.startOf("day");
  const startMinus = baseStart.minus({ days: preDays });

  const totalDays = preDays + eventDays + postDays;
  const occurrences: any[] = [];

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const dayDT = startMinus.plus({ days: dayIndex });
    const occKind: OccurrenceKind =
      dayIndex < preDays
        ? "prep"
        : dayIndex < preDays + eventDays
          ? "event"
          : "cleanup";

    for (const hallId of hallIds) {
      for (const slotId of allSlotIds) {
        const slot = timeSlotsRow.find((x) => x.id === slotId);
        if (!slot) continue;

        const startISO = dayDT.set({
          hour: Number(slot.start_time.split(":")[0]),
          minute: Number(slot.start_time.split(":")[1]),
          second: 0,
        }).toISO();

        let endISO = dayDT.set({
          hour: Number(slot.end_time.split(":")[0]),
          minute: Number(slot.end_time.split(":")[1]),
          second: 0,
        }).toISO();

        if (!startISO || !endISO) {
          return NextResponse.json(
            { error: "BAD_SLOT_TIME", message_ar: "مشكلة في وقت الفترة (time_slots)." },
            { status: 400 }
          );
        }

        const sDT = DateTime.fromISO(startISO);
        const eDT = DateTime.fromISO(endISO);
        if (eDT <= sDT) endISO = eDT.plus({ days: 1 }).toISO()!;

        occurrences.push({
          booking_id: id,
          hall_id: hallId,
          slot_id: slotId,
          start_ts: startISO,
          end_ts: endISO,
          kind: occKind,
        });
      }
    }
  }

  const { error: insErr } = await supabase
    .from("booking_occurrences")
    .insert(occurrences);

  if (insErr) {
    // rollback best-effort
    if (oldOccs?.length) {
      await supabase.from("booking_occurrences").insert(
        oldOccs.map((o: any) => ({
          booking_id: id,
          hall_id: o.hall_id,
          slot_id: o.slot_id,
          start_ts: o.start_ts,
          end_ts: o.end_ts,
          kind: o.kind,
        }))
      );
    }

    if (String(insErr.message || "").includes("prevent_hall_overlap")) {
      return NextResponse.json(
        {
          error: "HALL_OVERLAP",
          message_ar: "يوجد تعارض مع حجز آخر في نفس الصالة/الفترة.",
          details: insErr.message,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: insErr.message, message_ar: "فشل تحديث تفاصيل الحجز." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
