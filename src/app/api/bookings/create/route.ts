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

function toInt(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIntArray(v: any): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function toStrArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x))
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const supabase = supabaseServer();

  // ---- auth guard ----
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTH", message_ar: "لازم تسجل دخول." },
      { status: 401 }
    );
  }

  // Optional: block inactive users
  const { data: profile } = await supabase
    .from("profiles")
    .select("active,role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && profile.active === false) {
    return NextResponse.json(
      { error: "INACTIVE", message_ar: "حسابك غير مفعّل." },
      { status: 403 }
    );
  }

  // ---- parse body ----
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
  const client_name = pickString(body.client_name);
  const client_phone = pickString(body.client_phone);
  const notes = pickString(body.notes);

  const status = pickString(body.status, body.booking_status) || "confirmed";
  const booking_type = pickString(body.booking_type, body.kind) || "special";

  const payment_status = pickString(body.payment_status) || "unpaid";
  const payment_amount_raw = body.payment_amount ?? body.paymentAmount ?? null;
  const payment_amount =
    payment_amount_raw === null || payment_amount_raw === ""
      ? null
      : Number(payment_amount_raw);
  const amount_raw = body.amount ?? null;
  const amount = amount_raw === null || amount_raw === "" ? null : Number(amount_raw);
  const currency = pickString(body.currency) || "BHD";

  const event_start_date = pickString(
    body.event_start_date,
    body.eventStartDate,
    body.start_date,
    body.startDate,
    body.start
  );

  const event_days = toInt(body.event_days ?? body.eventDays ?? body.days ?? 1, 1);
  const pre_days = toInt(body.pre_days ?? body.preDays ?? body.prep_days ?? 0, 0);
  const post_days = toInt(body.post_days ?? body.postDays ?? body.clean_days ?? 0, 0);

  const hall_ids = toIntArray(body.hall_ids ?? body.hallIds);
  const slot_codes = toStrArray(
    body.slot_codes ?? body.slotCodes ?? body.event_slot_codes ?? body.eventSlotCodes
  );

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!event_start_date) missing.push("event_start_date");
  if (!hall_ids.length) missing.push("hall_ids");
  if (!slot_codes.length) missing.push("slot_codes");
  if (!(event_days >= 1 && event_days <= 30)) missing.push("event_days");
  if (pre_days < 0 || pre_days > 30) missing.push("pre_days");
  if (post_days < 0 || post_days > 30) missing.push("post_days");

  if (missing.length) {
    return NextResponse.json(
      {
        error: "MISSING_FIELDS",
        missing,
        message_ar: `بيانات ناقصة/غير صحيحة: ${missing.join(" , ")}`,
      },
      { status: 400 }
    );
  }

  const startDay = DateTime.fromISO(event_start_date, { zone: BAHRAIN_TZ }).startOf("day");
  if (!startDay.isValid) {
    return NextResponse.json(
      {
        error: "BAD_DATE",
        message_ar: "تاريخ البداية غير صحيح. لازم يكون بصيغة YYYY-MM-DD.",
      },
      { status: 400 }
    );
  }

  // ---- slots lookup by code ----
  const { data: slots, error: slotsErr } = await supabase
    .from("time_slots")
    .select("id,code,start_time,end_time")
    .in("code", slot_codes);

  if (slotsErr || !slots?.length) {
    return NextResponse.json(
      { error: "SLOT_LOOKUP_FAILED", message_ar: "تعذر جلب الفترات." },
      { status: 400 }
    );
  }

  // ---- insert booking header ----
  const { data: bookingRow, error: insBookingErr } = await supabase
    .from("bookings")
    .insert({
      title,
      client_name: client_name || null,
      client_phone: client_phone || null,
      notes: notes || null,
      status,
      payment_status,
      payment_amount: Number.isFinite(payment_amount as any) ? payment_amount : null,
      amount: Number.isFinite(amount as any) ? amount : null,
      currency,
      booking_type,
      event_start_date: startDay.toISODate(),
      event_days,
      pre_days,
      post_days,
      hall_ids,
      event_slot_codes: slot_codes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insBookingErr || !bookingRow?.id) {
    return NextResponse.json(
      { error: insBookingErr?.message || "BOOKING_INSERT_FAILED", message_ar: "فشل إنشاء الحجز." },
      { status: 400 }
    );
  }

  const booking_id = Number(bookingRow.id);

  // ---- build occurrences ----
  const totalDays = pre_days + event_days + post_days;
  const startMinus = startDay.minus({ days: pre_days });

  const occ: any[] = [];
  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const day = startMinus.plus({ days: dayIndex });
    const dayISO = day.toISODate()!;

    // DB enum: prep / event / cleanup
    const kind =
      dayIndex < pre_days
        ? "prep"
        : dayIndex < pre_days + event_days
          ? "event"
          : "cleanup";

    for (const hall_id of hall_ids) {
      for (const s of slots as any[]) {
        const startLocal = DateTime.fromISO(`${dayISO}T${s.start_time}`, {
          zone: BAHRAIN_TZ,
        });
        let endLocal = DateTime.fromISO(`${dayISO}T${s.end_time}`, { zone: BAHRAIN_TZ });
        if (endLocal <= startLocal) endLocal = endLocal.plus({ days: 1 });

        occ.push({
          booking_id,
          hall_id,
          slot_id: Number(s.id),
          start_ts: startLocal.toUTC().toISO({ suppressMilliseconds: true }),
          end_ts: endLocal.toUTC().toISO({ suppressMilliseconds: true }),
          kind,
        });
      }
    }
  }

  const { error: occErr } = await supabase.from("booking_occurrences").insert(occ);
  if (occErr) {
    // best-effort cleanup: remove header so user doesn't end up with a booking without occurrences
    await supabase.from("bookings").delete().eq("id", booking_id);

    const isOverlap = String(occErr.message || "").includes("prevent_hall_overlap");
    return NextResponse.json(
      {
        error: isOverlap ? "HALL_OVERLAP" : "OCC_INSERT_FAILED",
        message_ar: isOverlap
          ? "يوجد تعارض مع حجز آخر في نفس الصالة/الفترة."
          : "فشل إنشاء تفاصيل الحجز.",
        details: occErr.message,
      },
      { status: isOverlap ? 409 : 400 }
    );
  }

  return NextResponse.json({ ok: true, id: booking_id });
}
