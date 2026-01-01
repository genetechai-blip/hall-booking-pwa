export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const body = (await req.json()) as { full_name?: string };
  const full_name = (body.full_name || "").trim();

  if (!full_name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  if (full_name.length > 60) return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });

  const { error } = await supabase.from("profiles").update({ full_name }).eq("id", data.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
