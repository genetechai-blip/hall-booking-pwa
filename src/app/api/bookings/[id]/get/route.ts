import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseServer();

  const bookingId = Number(params.id);
  if (!Number.isFinite(bookingId)) {
    return NextResponse.json({ error: "BAD_ID" }, { status: 400 });
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { data: occs, error: oErr } = await supabase
    .from("booking_occurrences")
    .select("hall_id, slot_id, kind, start_ts")
    .eq("booking_id", bookingId);

  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  // ✅ الصالات: الأفضل من booking.hall_ids، وإذا فاضية خذها من occurrences
  const hall_ids: number[] = Array.isArray(booking.hall_ids) && booking.hall_ids.length
    ? booking.hall_ids
    : Array.from(new Set((occs ?? []).map((r: any) => Number(r.hall_id)).filter(Number.isFinite)));

  // ✅ الفترات: خذها من slot_id مباشرة (بدون الاعتماد على start_ts)
  const slot_ids: number[] = Array.from(
    new Set(
      (occs ?? [])
        .filter((r: any) => (r.kind ?? "event") === "event")
        .map((r: any) => Number(r.slot_id))
        .filter(Number.isFinite)
    )
  ).sort((a, b) => a - b);

  return NextResponse.json({
    booking,
    hall_ids,
    slot_ids,
  });
}
