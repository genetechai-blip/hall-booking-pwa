export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";

type Body = {
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  status?: "hold" | "confirmed";
  payment_status?: "unpaid" | "deposit" | "paid";
  start_date: string; // YYYY-MM-DD
  days: number;
  hall_ids: number[];
  slot_codes: Array<"morning" | "afternoon" | "night">;
};

export async function POST(req: Request) {
  const supabase = supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const body = (await req.json()) as Body;

  if (!body.title?.trim()) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });
  if (!body.start_date) return NextResponse.json({ error: "START_DATE_REQUIRED" }, { status: 400 });
  if (!body.days || body.days < 1 || body.days > 30) return NextResponse.json({ error: "DAYS_INVALID" }, { status: 400 });
  if (!Array.isArray(body.hall_ids) || body.hall_ids.length === 0) return NextResponse.json({ error: "HALL_REQUIRED" }, { status: 400 });
  if (!Array.isArray(body.slot_codes) || body.slot_codes.length === 0) return NextResponse.json({ error: "SLOT_REQUIRED" }, { status: 400 });

  // Fetch slots
  const { data: slots, error: slotsErr } = await supabase
    .from("time_slots")
    .select("id,code,start_time,end_time")
    .in("code", body.slot_codes);

  if (slotsErr) return NextResponse.json({ error: slotsErr.message }, { status: 400 });
  if (!slots || slots.length === 0) return NextResponse.json({ error: "NO_SLOTS" }, { status: 400 });

  // Create booking header
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
    })
    .select("id")
    .single();

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 400 });

  // Build occurrences: (day x slot x hall)
  const occ: any[] = [];
  const startDay = DateTime.fromISO(body.start_date, { zone: BAHRAIN_TZ }).startOf("day");

  for (let d = 0; d < body.days; d++) {
    const day = startDay.plus({ days: d });
    const dayISO = day.toISODate()!;

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
