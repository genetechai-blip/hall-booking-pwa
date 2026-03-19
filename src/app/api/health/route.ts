import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("halls")
    .select("id"); // يرجع قائمة ids

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    halls_count: data?.length ?? 0,
  });
}