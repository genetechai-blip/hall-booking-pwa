import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = supabaseServer();

  const { error } = await supabase.auth.signOut();

  // نرجّع المستخدم لصفحة الدخول بدل صفحة فاضية
  const url = new URL("/login", req.url);
  if (error) url.searchParams.set("signout", "failed");

  return NextResponse.redirect(url);
}
