import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";

const BAHRAIN_TZ = "Asia/Bahrain";

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
  const kind = pickString(body.kind, body.booking_type);
  const status = pickString(body.status, body.booking_status) || "hold";

  const eventStartDate = pickString(
    body.event_start_date,
    body.eventStartDate,
    body.start_date,
    body.startDate,
    body.start
  );

  const eventDays = Number(body.event_days ?? body.eventDays ?? 1);
  const preDays = Number(body.pre_days ?? body.preDays ?? 0);
  const postDays = Number(body.post_days ?? body.postDays ?? 0);

  const hallIds = toIntArray(body.hall_ids ?? body.hallIds);
  const slotIds = toIntArray(body.slot_ids ?? body.slotIds);
  let slotCodes = toStrArray(body.slot_codes ?? body.slotCodes);

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!eventStartDate) missing.push("event_start_date");
  if (!hallIds.length) missing.push("hall_ids");
  if (!slotIds.length && !slotCodes.length) missing.push("slot_ids/slot_codes");

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

  // update booking
  const { error: upErr } = await supabase
    .from("bookings")
    .update({
      title,
      kind,
      status,
      event_start_date: startDT.toISODate(),
      event_days: eventDays,
      pre_days: preDays,
      post_days: postDays,
      hall_ids: hallIds,
      slot_codes: slotCodes,
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json(
      { error: upErr.message, message_ar: "فشل تحديث بيانات الحجز." },
      { status: 400 }
    );
  }

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
          title,
          status,
          kind,
        });
      }
    }
  }

  const { error: insErr } = await supabase
    .from("booking_occurrences")
    .insert(occurrences);

  if (insErr) {
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
