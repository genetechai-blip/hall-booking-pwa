import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";

type Body = {
  booking_id: number;

  title: string;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;

  status?: "hold" | "confirmed" | "cancelled";
  kind?: "death" | "mawlid" | "fatiha" | "wedding" | "special";
  booking_type?: "event" | "prep" | "cleanup" | "special";
  amount?: number | null;

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

  if (!body.booking_id) return NextResponse.json({ error: "BOOKING_ID_REQUIRED" }, { status: 400 });
  if (!body.title?.trim()) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 });
  if (!body.start_date) return NextResponse.json({ error: "START_DATE_REQUIRED" }, { status: 400 });
  if (!body.days || body.days < 1 || body.days > 30) return NextResponse.json({ error: "DAYS_INVALID" }, { status: 400 });
  if (!Array.isArray(body.hall_ids) || body.hall_ids.length === 0) return NextResponse.json({ error: "HALL_REQUIRED" }, { status: 400 });
  if (!Array.isArray(body.slot_codes) || body.slot_codes.length === 0) return NextResponse.json({ error: "SLOT_REQUIRED" }, { status: 400 });

  // slots
  const { data: slots, error: slotsErr } = await supabase
    .from("time_slots")
    .select("id,code,start_time,end_time")
    .in("code", body.slot_codes);

  if (slotsErr) return NextResponse.json({ error: slotsErr.message }, { status: 400 });
  if (!slots || slots.length === 0) return NextResponse.json({ error: "NO_SLOTS" }, { status: 400 });

  // update booking header
  const { error: upErr } = await supabase
    .from("bookings")
    .update({
      title: body.title.trim(),
      client_name: body.client_name ?? null,
      client_phone: body.client_phone ?? null,
      notes: body.notes ?? null,
      status: body.status ?? "confirmed",
      kind: body.kind ?? "special",
      booking_type: body.booking_type ?? "event",
      amount: body.amount ?? null,
    })
    .eq("id", body.booking_id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // delete old occurrences
  const { error: delErr } = await supabase
    .from("booking_occurrences")
    .delete()
    .eq("booking_id", body.booking_id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  // rebuild occurrences
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
          booking_id: body.booking_id,
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
    const friendly = occErr.message.includes("prevent_hall_overlap")
      ? "تعارض: واحدة من الصالات محجوزة في نفس الفترة."
      : occErr.message;

    return NextResponse.json({ error: friendly }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
