export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = supabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const { data, error } = await supabase.from("halls").select("id,name").order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
