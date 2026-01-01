"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Hall, Slot } from "@/lib/types";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";

type SlotCode = "morning" | "afternoon" | "night";

function todayISO() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

export default function NewBookingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // booking fields
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<"hold" | "confirmed">("hold");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "deposit" | "paid">("unpaid");

  // event + buffers
  const [eventStartDate, setEventStartDate] = useState<string>(todayISO());
  const [eventDays, setEventDays] = useState<number>(1);
  const [preDays, setPreDays] = useState<number>(0);
  const [postDays, setPostDays] = useState<number>(0);

  // selection
  const [selectedHallIds, setSelectedHallIds] = useState<number[]>([]);
  const [selectedSlotCodes, setSelectedSlotCodes] = useState<SlotCode[]>(["night"]);

  useEffect(() => {
    (async () => {
      try {
        const [hRes, sRes] = await Promise.all([fetch("/api/meta/halls"), fetch("/api/meta/slots")]);
        if (!hRes.ok || !sRes.ok) throw new Error("META_FETCH_FAILED");
        const hallsData = await hRes.json();
        const slotsData = await sRes.json();
        setHalls(hallsData);
        setSlots(slotsData);
      } catch (e: any) {
        setError(e?.message || "حدث خطأ في تحميل البيانات.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const slotOptions = useMemo(() => {
    const order: Record<string, number> = { morning: 1, afternoon: 2, night: 3 };
    return [...slots].sort((a, b) => (order[a.code] ?? 99) - (order[b.code] ?? 99));
  }, [slots]);

  const totalDays = preDays + eventDays + postDays;

  const summary = useMemo(() => {
    const start = DateTime.fromISO(eventStartDate, { zone: BAHRAIN_TZ }).minus({ days: preDays }).toISODate()!;
    const end = DateTime.fromISO(eventStartDate, { zone: BAHRAIN_TZ })
      .plus({ days: eventDays + postDays - 1 })
      .toISODate()!;

    const parts: string[] = [];
    parts.push(`الفعالية تبدأ: ${eventStartDate} لمدة ${eventDays} يوم`);
    if (preDays) parts.push(`تجهيز قبلها: ${preDays} يوم`);
    if (postDays) parts.push(`تنظيف بعدها: ${postDays} يوم`);
    parts.push(`نطاق الحجز: ${start} → ${end} (مجموع ${totalDays} يوم)`);
    return parts.join(" • ");
  }, [eventStartDate, eventDays, preDays, postDays, totalDays]);

  function toggleHall(id: number) {
    setSelectedHallIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSlot(code: SlotCode) {
    setSelectedSlotCodes((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  async function submit() {
    setError(null);

    if (!title.trim()) return setError("اكتب عنوان الحجز (مثال: زواج محمد حسن).");
    if (selectedHallIds.length === 0) return setError("اختر صالة واحدة على الأقل.");
    if (selectedSlotCodes.length === 0) return setError("اختر فترة واحدة على الأقل.");
    if (eventDays < 1 || eventDays > 30) return setError("عدد أيام الفعالية لازم يكون بين 1 و 30.");
    if (preDays < 0 || preDays > 10) return setError("أيام التجهيز لازم تكون بين 0 و 10.");
    if (postDays < 0 || postDays > 10) return setError("أيام التنظيف لازم تكون بين 0 و 10.");

    setSaving(true);
    try {
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

          event_start_date: eventStartDate,
          event_days: eventDays,
          pre_days: preDays,
          post_days: postDays,

          hall_ids: selectedHallIds,
          slot_codes: selectedSlotCodes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "فشل حفظ الحجز.");

      // رجع للداشبورد على أسبوع تاريخ الفعالية
      router.push(`/dashboard?date=${eventStartDate}`);
    } catch (e: any) {
      setError(e?.message || "صار خطأ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>إضافة حجز</h2>
        <Link className="btn" href="/dashboard">رجوع</Link>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading ? (
          <div className="muted">جاري التحميل…</div>
        ) : (
          <div className="grid cols2">
            <div>
              <label className="label">عنوان الحجز</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: زواج محمد حسن" />
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
                  <option value="paid">مدفوع</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">اسم صاحب الحجز (اختياري)</label>
              <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="مثال: محمد حسن" />
            </div>

            <div>
              <label className="label">رقم الهاتف (اختياري)</label>
              <input className="input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="مثال: 3xxxxxxx" />
            </div>

            <div className="grid cols3">
              <div>
                <label className="label">تاريخ الفعالية</label>
                <input className="input" type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} />
              </div>
              <div>
                <label className="label">أيام الفعالية</label>
                <input className="input" type="number" min={1} max={30} value={eventDays} onChange={(e) => setEventDays(Number(e.target.value || 1))} />
              </div>
              <div>
                <label className="label">مجموع الأيام</label>
                <input className="input" value={String(totalDays)} disabled />
              </div>
            </div>

            <div className="grid cols3">
              <div>
                <label className="label">تجهيز قبل الفعالية (أيام)</label>
                <input className="input" type="number" min={0} max={10} value={preDays} onChange={(e) => setPreDays(Number(e.target.value || 0))} />
              </div>
              <div>
                <label className="label">تنظيف بعد الفعالية (أيام)</label>
                <input className="input" type="number" min={0} max={10} value={postDays} onChange={(e) => setPostDays(Number(e.target.value || 0))} />
              </div>
              <div>
                <label className="label">ملخص</label>
                <div className="badge" style={{ width: "100%", justifyContent: "center", textAlign: "center" }}>
                  {summary}
                </div>
              </div>
            </div>

            <div>
              <label className="label">ملاحظات (اختياري)</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div>
              <label className="label">اختر الصالات</label>
              <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {halls.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`btn ${selectedHallIds.includes(h.id) ? "primary" : ""}`}
                    onClick={() => toggleHall(h.id)}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">اختر الفترات</label>
              <div className="row">
                {slotOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn ${selectedSlotCodes.includes(s.code as any) ? "primary" : ""}`}
                    onClick={() => toggleSlot(s.code as any)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                (تطبق على الفعالية وأيام التجهيز/التنظيف كذلك)
              </div>
            </div>

            {error ? <div className="badge" style={{ borderColor: "rgba(176,0,32,.35)", background: "rgba(176,0,32,.08)" }}>{error}</div> : null}

            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn primary" disabled={saving} onClick={submit}>
                {saving ? "جاري الحفظ…" : "حفظ الحجز"}
              </button>
              <span className="small muted">* التعارض يمنع تلقائيًا من قاعدة البيانات</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
