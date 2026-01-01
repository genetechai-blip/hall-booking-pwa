export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,title,client_name,client_phone,notes,status,booking_type,payment_amount,currency,event_start_date,event_days,pre_days,post_days,hall_ids,event_slot_codes,created_by"
    )
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
