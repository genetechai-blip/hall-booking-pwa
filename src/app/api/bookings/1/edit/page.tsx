"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DateTime } from "luxon";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Hall, Slot, SlotCode } from "@/lib/types";

const BAHRAIN_TZ = "Asia/Bahrain";

function isoFromOccStart(start_ts: string) {
  return DateTime.fromISO(start_ts).setZone(BAHRAIN_TZ).toISODate()!;
}

export default function EditBookingPage() {
  const params = useParams<{ id: string }>();
  const bookingId = Number(params.id);

  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // fields
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<"hold" | "confirmed" | "cancelled">("confirmed");
  const [kind, setKind] = useState<"death" | "mawlid" | "fatiha" | "wedding" | "special">("special");
  const [amount, setAmount] = useState<string>("");

  const [startDate, setStartDate] = useState<string>(DateTime.now().setZone(BAHRAIN_TZ).toISODate()!);
  const [days, setDays] = useState<number>(1);

  const [hallIds, setHallIds] = useState<number[]>([]);
  const [slotCodes, setSlotCodes] = useState<SlotCode[]>(["night"]);

  function toggleHall(id: number) {
    setHallIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSlot(code: SlotCode) {
    setSlotCodes((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);

      const [{ data: hallsData }, { data: slotsData }] = await Promise.all([
        supabase.from("halls").select("id,name").order("id"),
        supabase.from("time_slots").select("id,code,name,start_time,end_time").order("id"),
      ]);

      setHalls((hallsData || []) as Hall[]);
      setSlots((slotsData || []) as Slot[]);

      // booking header
      const { data: b, error: bErr } = await supabase
        .from("bookings")
        .select("id,title,client_name,client_phone,notes,status,kind,amount")
        .eq("id", bookingId)
        .single();

      if (bErr) {
        setMsg(bErr.message);
        setLoading(false);
        return;
      }

      setTitle(b.title || "");
      setClientName(b.client_name || "");
      setClientPhone(b.client_phone || "");
      setNotes(b.notes || "");
      setStatus(b.status || "confirmed");
      setKind(b.kind || "special");
      setAmount(b.amount == null ? "" : String(b.amount));

      // occurrences
      const { data: occ, error: occErr } = await supabase
        .from("booking_occurrences")
        .select("hall_id,slot_id,start_ts")
        .eq("booking_id", bookingId);

      if (occErr) {
        setMsg(occErr.message);
        setLoading(false);
        return;
      }

      const occArr = occ || [];

      // start_date = أقل يوم
      if (occArr.length > 0) {
        const dates = occArr.map((o: any) => isoFromOccStart(o.start_ts));
        dates.sort();
        setStartDate(dates[0]);

        // days = عدد الأيام المختلفة
        const uniqDays = new Set(dates);
        setDays(Math.max(1, uniqDays.size));

        // halls selected
        const uniqHalls = new Set<number>(occArr.map((o: any) => o.hall_id));
        setHallIds(Array.from(uniqHalls));

        // slot_codes selected (نحوّل slot_id -> code)
        const slotIdToCode = new Map<number, SlotCode>();
        (slotsData || []).forEach((s: any) => slotIdToCode.set(s.id, s.code));

        const uniqCodes = new Set<SlotCode>();
        occArr.forEach((o: any) => {
          const c = slotIdToCode.get(o.slot_id);
          if (c) uniqCodes.add(c);
        });

        const codes = Array.from(uniqCodes);
        setSlotCodes(codes.length ? codes : ["night"]);
      }

      setLoading(false);
    })();
  }, [supabase, bookingId]);

  async function submit() {
    setMsg(null);
    if (!title.trim()) return setMsg("اكتب عنوان الحجز.");
    if (hallIds.length === 0) return setMsg("اختَر صالة واحدة على الأقل.");
    if (slotCodes.length === 0) return setMsg("اختَر فترة واحدة على الأقل.");
    if (days < 1 || days > 30) return setMsg("عدد الأيام غير صحيح.");

    setBusy(true);
    const res = await fetch("/api/bookings/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_id: bookingId,
        title: title.trim(),
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
        notes: notes.trim() || null,
        status,
        kind,
        amount: amount.trim() === "" ? null : Number(amount),
        start_date: startDate,
        days,
        hall_ids: hallIds,
        slot_codes: slotCodes,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setMsg(data?.error || "فشل التعديل.");
      return;
    }

    window.location.href = "/dashboard";
  }

  if (loading) {
    return (
      <main className="container">
        <div className="card">جاري التحميل...</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>تعديل حجز</h2>
        <a className="btn" href="/dashboard">رجوع</a>
      </div>

      <div className="grid cols2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="grid">
            <div>
              <label className="label">عنوان الحجز</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid cols2">
              <div>
                <label className="label">اسم العميل</label>
                <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <label className="label">رقم العميل</label>
                <input className="input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">ملاحظات</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="grid cols3">
              <div>
                <label className="label">الحالة</label>
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="confirmed">مؤكد</option>
                  <option value="hold">مبدئي</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </div>
              <div>
                <label className="label">نوع المناسبة</label>
                <select className="select" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                  <option value="death">وفاة</option>
                  <option value="mawlid">مولد</option>
                  <option value="fatiha">فاتحة</option>
                  <option value="wedding">زواج</option>
                  <option value="special">مناسبة خاصة</option>
                </select>
              </div>
              <div>
                <label className="label">المبلغ (اختياري)</label>
                <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            <hr />

            <div className="grid cols2">
              <div>
                <label className="label">تاريخ البداية</label>
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ fontSize: 16 }} />
              </div>
              <div>
                <label className="label">عدد الأيام</label>
                <input className="input" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className="label">الفترات</label>
              <div className="row">
                {slots.map((s) => (
                  <label key={s.code} className="badge" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={slotCodes.includes(s.code)}
                      onChange={() => toggleSlot(s.code)}
                      style={{ marginInlineEnd: 8 }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            {msg && (
              <div className="card" style={{ borderColor: "#ffd6d6", background: "#fff5f5" }}>
                <div className="small" style={{ color: "#b00020" }}>{msg}</div>
              </div>
            )}

            <button className="btn primary" onClick={submit} disabled={busy}>
              {busy ? "جاري الحفظ..." : "حفظ التعديل"}
            </button>
          </div>
        </div>

        <div className="card">
          <label className="label">الصالات</label>
          <div className="grid" style={{ gap: 8 }}>
            {halls.map((h) => (
              <label key={h.id} className="card" style={{ padding: 10, borderRadius: 12, cursor: "pointer" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{h.name}</strong>
                  <input type="checkbox" checked={hallIds.includes(h.id)} onChange={() => toggleHall(h.id)} />
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
