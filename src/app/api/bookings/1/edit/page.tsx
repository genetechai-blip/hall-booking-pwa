"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { BookingType, Hall, Slot } from "@/lib/types";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";
type SlotCode = "morning" | "afternoon" | "night";
type Status = "hold" | "confirmed" | "cancelled";

function todayISO() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

const TYPE_LABEL: Record<BookingType, string> = {
  death: "وفاة",
  mawlid: "مولد",
  fatiha: "فاتحة",
  wedding: "زواج",
  special: "مناسبة خاصة",
};

// قوالب تلقائية (تقدر تعدلها لاحقاً)
function applyTemplate(t: BookingType) {
  // event_slots: الافتراضي للفعالية
  if (t === "death") return { pre: 1, event: 2, post: 0, slots: ["morning","afternoon","night"] as SlotCode[] };
  if (t === "mawlid") return { pre: 1, event: 1, post: 1, slots: ["night"] as SlotCode[] };
  if (t === "fatiha") return { pre: 0, event: 3, post: 1, slots: ["night"] as SlotCode[] };
  if (t === "wedding") return { pre: 0, event: 1, post: 1, slots: ["morning","afternoon","night"] as SlotCode[] };
  return { pre: 0, event: 1, post: 0, slots: ["night"] as SlotCode[] };
}

export default function EditBookingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // fields
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<Status>("confirmed");
  const [bookingType, setBookingType] = useState<BookingType>("special");

  const [paymentAmount, setPaymentAmount] = useState<string>(""); // optional
  const [currency, setCurrency] = useState("BHD");

  const [eventStartDate, setEventStartDate] = useState<string>(todayISO());
  const [eventDays, setEventDays] = useState<number>(1);
  const [preDays, setPreDays] = useState<number>(0);
  const [postDays, setPostDays] = useState<number>(0);

  const [selectedHallIds, setSelectedHallIds] = useState<number[]>([]);
  const [selectedSlotCodes, setSelectedSlotCodes] = useState<SlotCode[]>(["night"]);

  useEffect(() => {
    (async () => {
      try {
        const [hRes, sRes, bRes] = await Promise.all([
          fetch("/api/meta/halls"),
          fetch("/api/meta/slots"),
          fetch(`/api/bookings/${id}/get`),
        ]);

        if (!hRes.ok || !sRes.ok || !bRes.ok) throw new Error("FETCH_FAILED");

        const hallsData = await hRes.json();
        const slotsData = await sRes.json();
        const booking = await bRes.json();

        setHalls(hallsData);
        setSlots(slotsData);

        setTitle(booking.title ?? "");
        setClientName(booking.client_name ?? "");
        setClientPhone(booking.client_phone ?? "");
        setNotes(booking.notes ?? "");

        setStatus(booking.status ?? "confirmed");
        setBookingType(booking.booking_type ?? "special");

        setPaymentAmount(booking.payment_amount == null ? "" : String(booking.payment_amount));
        setCurrency(booking.currency ?? "BHD");

        setEventStartDate(booking.event_start_date ?? todayISO());
        setEventDays(Number(booking.event_days ?? 1));
        setPreDays(Number(booking.pre_days ?? 0));
        setPostDays(Number(booking.post_days ?? 0));

        setSelectedHallIds(Array.isArray(booking.hall_ids) ? booking.hall_ids : []);
        setSelectedSlotCodes(Array.isArray(booking.event_slot_codes) ? booking.event_slot_codes : ["night"]);
      } catch (e: any) {
        setError(e?.message || "صار خطأ في تحميل الحجز.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const dayOptions = useMemo(() => Array.from({ length: 30 }, (_, i) => i + 1), []);
  const bufferOptions = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

  const slotOptions = useMemo(() => {
    const order: Record<string, number> = { morning: 1, afternoon: 2, night: 3 };
    return [...slots].sort((a, b) => (order[a.code] ?? 99) - (order[b.code] ?? 99));
  }, [slots]);

  function toggleHall(hallId: number) {
    setSelectedHallIds((prev) => (prev.includes(hallId) ? prev.filter((x) => x !== hallId) : [...prev, hallId]));
  }

  function toggleSlot(code: SlotCode) {
    setSelectedSlotCodes((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  function onTypeChange(t: BookingType) {
    setBookingType(t);
    const tpl = applyTemplate(t);
    setPreDays(tpl.pre);
    setEventDays(tpl.event);
    setPostDays(tpl.post);
    setSelectedSlotCodes(tpl.slots);
    // status default confirmed (لا نغيرها هنا)
  }

  async function save() {
    setError(null);
    if (!title.trim()) return setError("اكتب عنوان الحجز.");
    if (selectedHallIds.length === 0) return setError("اختر صالة واحدة على الأقل.");
    if (selectedSlotCodes.length === 0) return setError("اختر فترة فعالية واحدة على الأقل.");

    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          client_name: clientName.trim() || null,
          client_phone: clientPhone.trim() || null,
          notes: notes.trim() || null,

          status,
          booking_type: bookingType,

          payment_amount: paymentAmount.trim() === "" ? null : Number(paymentAmount),
          currency,

          event_start_date: eventStartDate,
          event_days: eventDays,
          pre_days: preDays,
          post_days: postDays,

          hall_ids: selectedHallIds,
          slot_codes: selectedSlotCodes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "فشل حفظ التعديل.");

      router.push(`/dashboard?date=${eventStartDate}`);
    } catch (e: any) {
      setError(e?.message || "صار خطأ.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">جاري التحميل…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>تعديل الحجز</h2>
        <div className="row">
          <Link className="btn" href="/dashboard">رجوع</Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="grid" style={{ gap: 12 }}>
          <div className="grid cols2">
            <div>
              <label className="label">عنوان الحجز</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <label className="label">نوع الحجز</label>
              <select className="select" value={bookingType} onChange={(e) => onTypeChange(e.target.value as any)}>
                {Object.keys(TYPE_LABEL).map((k) => (
                  <option key={k} value={k}>{TYPE_LABEL[k as BookingType]}</option>
                ))}
              </select>
              <div className="small muted" style={{ marginTop: 6 }}>
                تغيير النوع يطبّق قالب أيام تلقائي (تقدر تعدله بعد).
              </div>
            </div>
          </div>

          <div className="grid cols3">
            <div>
              <label className="label">الحالة (الافتراضي مؤكد)</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="confirmed">Confirmed (مؤكد)</option>
                <option value="hold">Hold (مبدئي)</option>
                <option value="cancelled">Cancelled (ملغي)</option>
              </select>
            </div>

            <div>
              <label className="label">المبلغ (اختياري)</label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="مثال: 50"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>

            <div>
              <label className="label">العملة</label>
              <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
          </div>

          <div className="grid cols2">
            <div>
              <label className="label">اسم صاحب الحجز (اختياري)</label>
              <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label className="label">رقم الهاتف (اختياري)</label>
              <input className="input" inputMode="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid cols2">
            <div>
              <label className="label">تاريخ الفعالية</label>
              <input className="input" type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} />
            </div>

            <div className="grid cols3">
              <div>
                <label className="label">أيام الفعالية</label>
                <select className="select" value={eventDays} onChange={(e) => setEventDays(Number(e.target.value))}>
                  {dayOptions.map((n) => <option key={n} value={n}>{n} يوم</option>)}
                </select>
              </div>
              <div>
                <label className="label">تجهيز قبل (أيام)</label>
                <select className="select" value={preDays} onChange={(e) => setPreDays(Number(e.target.value))}>
                  {bufferOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">تنظيف بعد (أيام)</label>
                <select className="select" value={postDays} onChange={(e) => setPostDays(Number(e.target.value))}>
                  {bufferOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="label">ملاحظات</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="grid cols2">
            <div>
              <label className="label">اختر الصالات</label>
              <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
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
              <label className="label">فترات الفعالية</label>
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
                ملاحظة: أيام التجهيز/التنظيف تُحجز تلقائيًا (الصبح+العصر+الليل) لمنع أي تعارض.
              </div>
            </div>
          </div>

          {error ? (
            <div className="badge" style={{ borderColor: "rgba(176,0,32,.35)", background: "rgba(176,0,32,.08)" }}>
              {error}
            </div>
          ) : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn primary" disabled={saving} onClick={save}>
              {saving ? "جاري الحفظ…" : "حفظ التعديل"}
            </button>
            <span className="small muted">إذا صار تعارض، بيطلع لك تنبيه مباشر</span>
          </div>
        </div>
      </div>
    </div>
  );
}
