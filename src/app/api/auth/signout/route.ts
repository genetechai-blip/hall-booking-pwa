import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = supabaseServer();
  await supabase.auth.signOut();

  // رجّع المستخدم للّوقن بدل صفحة فاضية
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

export async function POST() {
  const supabase = supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
