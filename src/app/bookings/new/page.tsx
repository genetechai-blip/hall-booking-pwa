"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Hall, Slot } from "@/lib/types";
import { todayBahrainISODate } from "@/lib/time";

export default function NewBookingPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"hold" | "confirmed">("hold");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "deposit" | "paid">("unpaid");

  const [startDate, setStartDate] = useState(todayBahrainISODate());
  const [days, setDays] = useState(1);

  const [hallIds, setHallIds] = useState<number[]>([]);
  const [slotCodes, setSlotCodes] = useState<Array<"morning"|"afternoon"|"night">>(["night"]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: hallsData } = await supabase.from("halls").select("id,name").order("id");
      const { data: slotsData } = await supabase.from("time_slots").select("id,code,name,start_time,end_time").order("id");
      setHalls((hallsData || []) as Hall[]);
      setSlots((slotsData || []) as Slot[]);
      setLoading(false);
    })();
  }, [supabase]);

  function toggleHall(id: number) {
    setHallIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleSlot(code: "morning"|"afternoon"|"night") {
    setSlotCodes((prev) => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]);
  }

  async function submit() {
    setMsg(null);
    if (!title.trim()) return setMsg("اكتب عنوان الحجز.");
    if (hallIds.length === 0) return setMsg("اختَر صالة واحدة على الأقل.");
    if (slotCodes.length === 0) return setMsg("اختَر فترة واحدة على الأقل.");
    if (days < 1 || days > 30) return setMsg("عدد الأيام غير صحيح.");

    setBusy(true);
    const res = await fetch("/api/bookings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
        notes: notes.trim() || null,
        status,
        payment_status: paymentStatus,
        start_date: startDate,
        days,
        hall_ids: hallIds,
        slot_codes: slotCodes
      })
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setMsg(data?.error || "فشل الحفظ.");
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
        <h2 style={{ margin: 0 }}>إضافة حجز</h2>
        <a className="btn" href="/dashboard">رجوع</a>
      </div>

      <div className="grid cols2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="grid">
            <div>
              <label className="label">عنوان الحجز</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: مجلس عزاء - عائلة ..." />
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

            <div className="grid cols2">
              <div>
                <label className="label">الحالة</label>
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="hold">Hold (مبدئي)</option>
                  <option value="confirmed">Confirmed (مؤكد)</option>
                </select>
              </div>
              <div>
                <label className="label">الدفع</label>
                <select className="select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)}>
                  <option value="unpaid">غير مدفوع</option>
                  <option value="deposit">عربون</option>
                  <option value="paid">مدفوع بالكامل</option>
                </select>
              </div>
            </div>

            <hr />

            <div className="grid cols2">
              <div>
                <label className="label">تاريخ البداية</label>
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
                    {s.name} <span className="muted small">({s.start_time}-{s.end_time})</span>
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
              {busy ? "جاري الحفظ..." : "حفظ"}
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

          <hr />
          <div className="small muted">
            إذا طلع تعارض، النظام بيرفض الحجز لأن نفس الصالة محجوزة بنفس الوقت.
          </div>
        </div>
      </div>
    </main>
  );
}
