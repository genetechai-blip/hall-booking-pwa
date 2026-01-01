import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BAHRAIN_TZ = "Asia/Bahrain";

function parseTime(t: string) {
  // "08:00:00" -> {h:8,m:0,s:0}
  const [hh, mm, ss] = (t || "00:00:00").split(":").map((x) => Number(x));
  return { hh: hh || 0, mm: mm || 0, ss: ss || 0 };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const bookingId = Number(params.id);
  if (!bookingId) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });

  try {
    const body = await req.json();

    const {
      title,
      client_name,
      client_phone,
      notes,
      status,
      booking_type,      // ✅ مهم
      payment_amount,
      currency,
      event_start_date,
      event_days,
      pre_days,
      post_days,
      hall_ids,
      slot_ids,
    } = body || {};

    if (!title || !Array.isArray(hall_ids) || hall_ids.length === 0 || !Array.isArray(slot_ids) || slot_ids.length === 0) {
      return NextResponse.json({ error: "بيانات ناقصة." }, { status: 400 });
    }

    const supabase = await supabaseServer();

    // 1) Update booking (لا نستخدم kind نهائيًا)
    const { error: upErr } = await supabase
      .from("bookings")
      .update({
        title,
        client_name,
        client_phone,
        notes,
        status,
        booking_type,                 // ✅
        payment_amount,
        currency,
        event_start_date,
        event_days,
        pre_days,
        post_days,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (upErr) throw new Error(upErr.message);

    // 2) Rebuild booking_occurrences
    // delete old
    const { error: delErr } = await supabase.from("booking_occurrences").delete().eq("booking_id", bookingId);
    if (delErr) throw new Error(delErr.message);

    // load all slots (عشان أيام التجهيز/التنظيف نحجز كل الفترات)
    const { data: allSlots, error: slotsErr } = await supabase.from("time_slots").select("id, start_time, end_time");
    if (slotsErr) throw new Error(slotsErr.message);

    const allSlotIds = (allSlots || []).map((s: any) => Number(s.id));
    const slotById = new Map<number, any>((allSlots || []).map((s: any) => [Number(s.id), s]));

    const evStart = DateTime.fromISO(event_start_date, { zone: BAHRAIN_TZ }).startOf("day");
    const pre = Number(pre_days || 0);
    const evDays = Math.max(1, Number(event_days || 1));
    const post = Number(post_days || 0);

    const rangeStart = evStart.minus({ days: pre });
    const totalDays = pre + evDays + post;

    const rows: any[] = [];

    for (let d = 0; d < totalDays; d++) {
      const day = rangeStart.plus({ days: d });
      const isEvent = day >= evStart && day < evStart.plus({ days: evDays });

      const useSlotIds: number[] = isEvent ? slot_ids.map(Number) : allSlotIds;

      for (const hallIdRaw of hall_ids) {
        const hallId = Number(hallIdRaw);

        for (const slotIdRaw of useSlotIds) {
          const slotId = Number(slotIdRaw);
          const s = slotById.get(slotId);
          if (!s) continue;

          const st = parseTime(s.start_time);
          const et = parseTime(s.end_time);

          let startTs = day.set({ hour: st.hh, minute: st.mm, second: st.ss });
          let endTs = day.set({ hour: et.hh, minute: et.mm, second: et.ss });

          // لو end قبل start (مثلاً فترة تمتد بعد منتصف الليل)
          if (endTs <= startTs) endTs = endTs.plus({ days: 1 });

          rows.push({
            booking_id: bookingId,
            hall_id: hallId,
            slot_id: slotId,
            start_ts: startTs.toISO(),
            end_ts: endTs.toISO(),
            // اختياري: نسخ النوع داخل occurrence لو عندك عمود kind (إذا ما عندك اتركها)
            // kind: booking_type,
          });
        }
      }
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("booking_occurrences").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Update failed" }, { status: 500 });
  }
}
