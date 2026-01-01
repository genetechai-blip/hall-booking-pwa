import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");
  redirect("/login");
}
