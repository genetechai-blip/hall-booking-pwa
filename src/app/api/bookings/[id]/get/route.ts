import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BAHRAIN_TZ = "Asia/Bahrain";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const bookingId = Number(params.id);
  if (!bookingId) return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });

  try {
    const supabase = await supabaseServer();

    // 1) booking
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select(
        `
        id,
        title,
        client_name,
        client_phone,
        notes,
        status,
        booking_type,
        payment_amount,
        currency,
        event_start_date,
        event_days,
        pre_days,
        post_days
        `
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // 2) occurrences (اسم الجدول الصحيح)
    const { data: occ, error: oErr } = await supabase
      .from("booking_occurrences")
      .select("hall_id, slot_id, start_ts")
      .eq("booking_id", bookingId);

    if (oErr) throw new Error(oErr.message);

    const occurrences = occ || [];

    // halls selected = كل الصالات اللي للحجز
    const hallSet = new Set<number>();
    for (const r of occurrences) hallSet.add(Number(r.hall_id));
    const hall_ids = Array.from(hallSet);

    // slot_ids selected = فترات "يوم/أيام الفعالية فقط"
    const evStartISO = booking.event_start_date;
    const evDays = Math.max(1, Number(booking.event_days || 1));

    const evStart = DateTime.fromISO(evStartISO, { zone: BAHRAIN_TZ }).startOf("day");
    const evEnd = evStart.plus({ days: evDays }); // exclusive

    const slotSet = new Set<number>();
    for (const r of occurrences) {
      const ts = DateTime.fromISO(r.start_ts, { zone: BAHRAIN_TZ });
      if (ts >= evStart && ts < evEnd) slotSet.add(Number(r.slot_id));
    }
    const slot_ids = Array.from(slotSet);

    return NextResponse.json({
      booking,
      hall_ids,
      slot_ids,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Get failed" }, { status: 500 });
  }
}
