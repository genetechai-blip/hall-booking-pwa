import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExportUI from "./ui/ExportUI";

export default async function ExportPage() {
  const supabase = supabaseServer();

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // جلب الصالات
  const { data: halls } = await supabase.from("halls").select("id,name").order("id");

  return <ExportUI halls={halls || []} />;
}
