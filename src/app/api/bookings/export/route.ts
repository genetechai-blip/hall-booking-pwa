import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function s(v: any) {
  return v === null || v === undefined ? "" : String(v);
}

function isISODate(v: string) {
  // YYYY-MM-DD بسيط
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  let from = url.searchParams.get("from"); // optional
  let to = url.searchParams.get("to");     // optional
  const hallId = url.searchParams.get("hall_id"); // optional

  // normalize dates:
  // - لو واحد موجود والثاني لا: نخليهم نفس اليوم
  if (from && !to) to = from;
  if (to && !from) from = to;

  if (from && !isISODate(from)) {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }
  if (to && !isISODate(to)) {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }

  const hallNum = hallId ? Number(hallId) : null;
  if (hallId) {
    if (
      hallNum === null ||
      Number.isNaN(hallNum) ||
      !Number.isFinite(hallNum) ||
      hallNum <= 0
    ) {
      return NextResponse.json({ error: "Invalid hall_id" }, { status: 400 });
    }
  }

  const supabase = supabaseServer();

  // Auth
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  if (!profile?.active || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Halls map (for names)
  let hallsQuery = supabase.from("halls").select("id, name").order("id");
  if (hallNum) hallsQuery = hallsQuery.eq("id", hallNum);

  const { data: halls, error: hallsErr } = await hallsQuery;
  if (hallsErr) {
    return NextResponse.json({ error: hallsErr.message }, { status: 500 });
  }

  const hallMap = new Map<number, string>();
  (halls ?? []).forEach((h: any) => hallMap.set(h.id, h.name));

  // Bookings query
  let q = supabase
    .from("bookings")
    .select(`
      id, title, client_name, client_phone, notes,
      status, payment_status, payment_amount, currency,
      event_start_date, event_days, pre_days, post_days,
      booking_type, hall_ids, event_slot_codes,
      created_at, updated_at
    `)
    .order("event_start_date", { ascending: true });

  // optional date filter
  if (from && to) {
    q = q.gte("event_start_date", from).lte("event_start_date", to);
  }

  // optional hall filter (hall_ids is int8[])
  if (hallNum) {
    q = q.contains("hall_ids", [hallNum]);
  }

  const { data: bookings, error: bErr } = await q;
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  // Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hall Booking PWA";
  const ws = wb.addWorksheet("Bookings");

  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Title", key: "title", width: 28 },
    { header: "Type", key: "booking_type", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Client Name", key: "client_name", width: 18 },
    { header: "Client Phone", key: "client_phone", width: 16 },
    { header: "Start Date", key: "event_start_date", width: 14 },
    { header: "Event Days", key: "event_days", width: 10 },
    { header: "Prep Days", key: "pre_days", width: 10 },
    { header: "Cleanup Days", key: "post_days", width: 12 },
    { header: "Halls", key: "halls", width: 30 },
    { header: "Slots", key: "slots", width: 22 },
    { header: "Payment Status", key: "payment_status", width: 14 },
    { header: "Payment Amount", key: "payment_amount", width: 14 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Notes", key: "notes", width: 30 },
    { header: "Created At", key: "created_at", width: 20 },
    { header: "Updated At", key: "updated_at", width: 20 },
  ];

  for (const b of bookings ?? []) {
    const hallNames =
      Array.isArray(b.hall_ids)
        ? b.hall_ids.map((id: number) => hallMap.get(id) ?? String(id)).join("، ")
        : s(b.hall_ids);

    const slotCodes =
      Array.isArray(b.event_slot_codes)
        ? b.event_slot_codes.join(", ")
        : s(b.event_slot_codes);

    ws.addRow({
      id: b.id,
      title: s(b.title),
      booking_type: s(b.booking_type),
      status: s(b.status),
      client_name: s(b.client_name),
      client_phone: s(b.client_phone),
      event_start_date: s(b.event_start_date),
      event_days: b.event_days ?? "",
      pre_days: b.pre_days ?? "",
      post_days: b.post_days ?? "",
      halls: hallNames,
      slots: slotCodes,
      payment_status: s(b.payment_status),
      payment_amount: b.payment_amount ?? "",
      currency: s(b.currency),
      notes: s(b.notes),
      created_at: s(b.created_at),
      updated_at: s(b.updated_at),
    });
  }

  ws.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();

  const rangePart = from && to ? `${from}_${to}` : "ALL";
  const filename = `bookings_${hallNum ?? "all"}_${rangePart}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
