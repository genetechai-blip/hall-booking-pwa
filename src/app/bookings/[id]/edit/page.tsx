"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Hall, Slot, BookingType, BookingStatus } from "@/lib/types";

const BAHRAIN_TZ = "Asia/Bahrain";

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}
function occDayISO(start_ts: string) {
  return DateTime.fromISO(start_ts).setZone(BAHRAIN_TZ).toISODate()!;
}

const TYPE_LABEL: Record<BookingType, string> = {
  death: "وفاة",
  mawlid: "مولد",
  fatiha: "فاتحة",
  wedding: "زواج",
  special: "مناسبة خاصة",
};

export default function EditBookingPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const bookingId = Number((params as any)?.id);

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

  const [status, setStatus] = useState<BookingStatus>("confirmed");
  const [bookingType, setBookingType] = useState<BookingType>("special");

  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [currency, setCurrency] = useState("BHD");

  const [eventStartDate, setEventStartDate] = useState<string>(isoToday());
  const [eventDays, setEventDays] = useState<number>(1);
  const [preDays, setPreDays] = useState<number>(0);
  const [postDays, setPostDays] = useState<number>(0);

  const [selectedHallIds, setSelectedHallIds] = useState<number[]>([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);

  const dayOptions = useMemo(() => Array.from({ length: 30 }, (_, i) => i + 1), []);
  const bufferOptions = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

  function toggleHall(id: number) {
    setSelectedHallIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleSlotId(id: number) {
    setSelectedSlotIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  useEffect(() => {
    if (!bookingId) return;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // meta
        const [hRes, sRes] = await Promise.all([fetch("/api/meta/halls"), fetch("/api/meta/slots")]);
        if (!hRes.ok || !sRes.ok) throw new Error("META_FETCH_FAILED");
        const hallsJson = await hRes.json();
        const slotsJson = await sRes.json();
        setHalls(hallsJson);
        setSlots(slotsJson);

        // booking (IMPORTANT: لا نستخدم kind نهائيًا)
        const { data: b, error: bErr } = await supabase
          .from("bookings")
          .select("*")
          .eq("id", bookingId)
          .maybeSingle();

        if (bErr) throw new Error(bErr.message);
        if (!b) throw new Error("Booking not found");

        // occurrences -> لاستخراج الصالات والفترات المختارة
        const { data: occ, error: oErr } = await supabase
          .from("booking_occurrences")
          .select("hall_id, slot_id, start_ts")
          .eq("booking_id", bookingId);

        if (oErr) throw new Error(oErr.message);

        // تعبئة الحقول
        setTitle((b.title || "").toString());
        setClientName((b.client_name || "").toString());
        setClientPhone((b.client_phone || "").toString());
        setNotes((b.notes || "").toString());

        setStatus((b.status as BookingStatus) || "confirmed");

        // ✅ هنا أصل المشكلة: لازم booking_type مو kind
        setBookingType(((b.booking_type as BookingType) || "special") as BookingType);

        // مبلغ اختياري (في DB اسمها payment_amount غالبًا)
        const amt =
          typeof b.payment_amount === "number"
            ? b.payment_amount
            : typeof b.amount === "number"
            ? b.amount
            : null;
        setPaymentAmount(amt === null ? "" : String(amt));
        setCurrency((b.currency || "BHD").toString());

        // تواريخ/أيام
        const start =
          (b.event_start_date as string) ||
          (b.start_date as string) ||
          (occ && occ.length ? occDayISO(occ[0].start_ts) : isoToday());
        setEventStartDate(start);

        setEventDays(Number(b.event_days ?? b.days ?? 1));
        setPreDays(Number(b.pre_days ?? 0));
        setPostDays(Number(b.post_days ?? 0));

        // ✅ الصالات: من كل occurrences (عادة نفس الصالات)
        const hallIds = Array.from(new Set((occ || []).map((x: any) => Number(x.hall_id)).filter(Boolean)));
        setSelectedHallIds(hallIds);

        // ✅ الفترات: خذها من يوم الفعالية فقط عشان ما يختلط مع أيام التجهيز/التنظيف
        const onEventDay = (occ || []).filter((x: any) => occDayISO(x.start_ts) === start);
        const slotIds = Array.from(
          new Set((onEventDay.length ? onEventDay : occ || []).map((x: any) => Number(x.slot_id)).filter(Boolean))
        );
        setSelectedSlotIds(slotIds);
      } catch (e: any) {
        setError(e?.message || "صار خطأ في تحميل بيانات الحجز.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, supabase]);

  async function submit() {
    setError(null);

    if (!title.trim()) return setError("اكتب عنوان الحجز.");
    if (selectedHallIds.length === 0) return setError("اختر صالة واحدة على الأقل.");
    if (selectedSlotIds.length === 0) return setError("اختر فترة واحدة على الأقل.");

    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          client_name: clientName.trim() || null,
          client_phone: clientPhone.trim() || null,
          notes: notes.trim() || null,

          status,               // confirmed/hold/cancelled
          booking_type: bookingType, // ✅ مهم: booking_type

          payment_amount: paymentAmount.trim() === "" ? null : Number(paymentAmount),
          currency,

          event_start_date: eventStartDate,
          event_days: eventDays,
          pre_days: preDays,
          post_days: postDays,

          hall_ids: selectedHallIds,
          slot_ids: selectedSlotIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "فشل التعديل.");

      router.push(`/dashboard?date=${eventStartDate}`);
    } catch (e: any) {
      setError(e?.message || "فشل التعديل.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>تعديل حجز</h2>
        <Link className="btn" href="/dashboard">
          رجوع
        </Link>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading ? (
          <div className="muted">جاري التحميل…</div>
        ) : (
          <div className="grid" style={{ gap: 12 }}>
            <div className="grid cols2">
              <div>
                <label className="label">عنوان الحجز</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div>
                <label className="label">نوع المناسبة</label>
                <select className="select" value={bookingType} onChange={(e) => setBookingType(e.target.value as any)}>
                  {Object.keys(TYPE_LABEL).map((k) => (
                    <option key={k} value={k}>
                      {TYPE_LABEL[k as BookingType]}
                    </option>
                  ))}
                </select>
              </div>
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
                <label className="label">اسم العميل (اختياري)</label>
                <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <label className="label">رقم العميل (اختياري)</label>
                <input className="input" inputMode="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">ملاحظات</label>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="grid cols2">
              <div>
                <label className="label">تاريخ البداية</label>
                <input className="input" type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} />
              </div>

              <div className="grid cols3">
                <div>
                  <label className="label">عدد الأيام</label>
                  <select className="select" value={eventDays} onChange={(e) => setEventDays(Number(e.target.value))}>
                    {dayOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">تجهيز قبل</label>
                  <select className="select" value={preDays} onChange={(e) => setPreDays(Number(e.target.value))}>
                    {bufferOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">تنظيف بعد</label>
                  <select className="select" value={postDays} onChange={(e) => setPostDays(Number(e.target.value))}>
                    {bufferOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid cols2">
              <div>
                <label className="label">الصالات</label>
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
                <label className="label">الفترات</label>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn ${selectedSlotIds.includes(s.id) ? "primary" : ""}`}
                      onClick={() => toggleSlotId(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error ? (
              <div className="badge" style={{ borderColor: "rgba(176,0,32,.35)", background: "rgba(176,0,32,.08)" }}>
                {error}
              </div>
            ) : null}

            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn primary" disabled={saving} onClick={submit}>
                {saving ? "جاري الحفظ…" : "حفظ التعديل"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
