"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Hall = { id: number; name: string };
type Slot = { id: number; code: string; name: string; start_time: string; end_time: string };

const CURRENCY_SYMBOL = "د.ب";

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

export default function EditBookingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bookingId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // form
  const [title, setTitle] = useState("");
  const [eventStartDate, setEventStartDate] = useState(""); // YYYY-MM-DD
  const [bookingType, setBookingType] = useState("death"); // death/mawlid/fatiha/wedding/special
  const [bookingStatus, setBookingStatus] = useState("confirmed"); // confirmed/hold/cancelled

  const [eventDays, setEventDays] = useState(1);
  const [preDays, setPreDays] = useState(0); // التجهيز
  const [postDays, setPostDays] = useState(0); // التنظيف

  const [selectedHallIds, setSelectedHallIds] = useState<number[]>([]);
  const [selectedSlotCodes, setSelectedSlotCodes] = useState<string[]>([]);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState<string>("");

  const [error, setError] = useState<string>("");

  const daysOptions = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 1), []);
  const prepOptions = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);
  const cleanOptions = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);

  function toggleHall(id: number) {
    setSelectedHallIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function toggleSlot(code: string) {
    setSelectedSlotCodes((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]
    );
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [hRes, sRes] = await Promise.all([
          fetch("/api/meta/halls", { cache: "no-store" }),
          fetch("/api/meta/slots", { cache: "no-store" }),
        ]);

        const hJson = await hRes.json();
        const sJson = await sRes.json();

        if (!alive) return;

        setHalls(hJson.halls || []);
        setSlots(sJson.slots || []);

        // booking
        const bRes = await fetch(`/api/bookings/${bookingId}/get`, { cache: "no-store" });
        const bJson = await bRes.json();

        if (!alive) return;

        if (!bRes.ok) {
          setError(bJson?.error || "تعذر جلب بيانات الحجز.");
          return;
        }

        const b = bJson.booking;

        setTitle((b?.title || "").trim());
        setEventStartDate((b?.event_start_date || "").trim());
        setBookingType((b?.booking_type || "death") as string);
        setBookingStatus((b?.booking_status || "confirmed") as string);

        setEventDays(Number(b?.event_days ?? 1) || 1);
        setPreDays(Number(b?.pre_days ?? 0) || 0);
        setPostDays(Number(b?.post_days ?? 0) || 0);

        // ✅ مهم: خذها من booking نفسه (مو من occurrences)
        setSelectedHallIds(Array.isArray(b?.hall_ids) ? b.hall_ids : []);
        setSelectedSlotCodes(
          Array.isArray(b?.event_slot_codes) ? b.event_slot_codes : []
        );

        setClientName((b?.client_name || "").trim());
        setClientPhone((b?.client_phone || "").trim());
        setNotes((b?.notes || "").trim());

        const amt = b?.payment_amount;
        setAmount(typeof amt === "number" ? String(amt) : "");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "خطأ غير متوقع.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    if (bookingId) load();
    return () => {
      alive = false;
    };
  }, [bookingId]);

  async function onSave() {
    setError("");

    const missing: string[] = [];
    if (!title.trim()) missing.push("عنوان الحجز");
    if (!eventStartDate) missing.push("تاريخ البداية");
    if (selectedHallIds.length === 0) missing.push("الصالات");
    if (selectedSlotCodes.length === 0) missing.push("الفترات");

    if (missing.length) {
      setError("بيانات ناقصة: " + missing.join("، "));
      return;
    }

    const amtNum = amount.trim() === "" ? null : Number(amount);
    if (amount.trim() !== "" && (!Number.isFinite(amtNum) || (amtNum ?? 0) < 0)) {
      setError("قيمة المبلغ غير صحيحة.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        event_start_date: eventStartDate,
        event_days: Number(eventDays),
        pre_days: Number(preDays),
        post_days: Number(postDays),
        hall_ids: selectedHallIds,
        slot_codes: selectedSlotCodes,
        booking_type: bookingType,
        booking_status: bookingStatus,
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
        notes: notes.trim() || null,
        payment_amount: amtNum,
        currency: CURRENCY_SYMBOL,
      };

      const res = await fetch(`/api/bookings/${bookingId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        // لو السيرفر رجع missing list
        if (j?.error === "missing_fields" && Array.isArray(j?.missing)) {
          setError("بيانات ناقصة: " + j.missing.join("، "));
        } else {
          setError(j?.error || "تعذر حفظ التعديل.");
        }
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "تعذر حفظ التعديل.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn" onClick={() => router.back()}>
            رجوع
          </button>

          <div style={{ textAlign: "right" }}>
            <h2 style={{ margin: 0 }}>تعديل الحجز</h2>
            <div className="muted small">عدّل البيانات ثم اضغط حفظ.</div>
          </div>
        </div>

        <hr />

        {error ? (
          <div
            className="card"
            style={{
              borderColor: "rgba(176, 0, 32, 0.25)",
              background: "rgba(176, 0, 32, 0.06)",
              color: "#7a0016",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="muted">... جاري التحميل</div>
        ) : (
          <div className="grid">
            {/* 1) عنوان الحجز */}
            <div>
              <label className="label">عنوان الحجز</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: وفاة السيدة..."
              />
            </div>

            {/* 2) التاريخ */}
            <div>
              <label className="label">تاريخ البداية</label>
              <input
                className="input"
                dir="ltr"
                type="date"
                value={eventStartDate}
                onChange={(e) => setEventStartDate(e.target.value)}
              />
            </div>

            {/* 3) نوع + حالة */}
            <div className="grid cols2">
              <div>
                <label className="label">نوع الحجز</label>
                <select
                  className="select"
                  value={bookingType}
                  onChange={(e) => setBookingType(e.target.value)}
                >
                  <option value="death">وفاة</option>
                  <option value="mawlid">مولد</option>
                  <option value="fatiha">فاتحة</option>
                  <option value="wedding">زواج</option>
                  <option value="special">خاصة</option>
                </select>
              </div>

              <div>
                <label className="label">حالة الحجز</label>
                <select
                  className="select"
                  value={bookingStatus}
                  onChange={(e) => setBookingStatus(e.target.value)}
                >
                  <option value="confirmed">مؤكد</option>
                  <option value="hold">مبدئي</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </div>
            </div>

            {/* 4) الأيام + التجهيز + التنظيف */}
            <div className="grid cols3">
              <div>
                <label className="label">عدد الأيام</label>
                <select
                  className="select"
                  value={String(eventDays)}
                  onChange={(e) => setEventDays(Number(e.target.value))}
                >
                  {daysOptions.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">التجهيز</label>
                <select
                  className="select"
                  value={String(preDays)}
                  onChange={(e) => setPreDays(Number(e.target.value))}
                >
                  {prepOptions.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">التنظيف</label>
                <select
                  className="select"
                  value={String(postDays)}
                  onChange={(e) => setPostDays(Number(e.target.value))}
                >
                  {cleanOptions.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 5) الصالات */}
            <div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <label className="label" style={{ margin: 0 }}>
                  اختر الصالات
                </label>
                <span className="badge">{selectedHallIds.length} محددة</span>
              </div>

              <div className="grid cols2" style={{ gap: 10 }}>
                {halls.map((h) => {
                  const active = selectedHallIds.includes(h.id);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggleHall(h.id)}
                      className={cx("btn", active && "primary")}
                      style={{
                        width: "100%",
                        borderRadius: 16,
                        padding: "12px 12px",
                      }}
                    >
                      {h.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6) الفترات */}
            <div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <label className="label" style={{ margin: 0 }}>
                  اختر الفترات
                </label>
                <span className="badge">{selectedSlotCodes.length} محددة</span>
              </div>

              <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {slots.map((s) => {
                  const active = selectedSlotCodes.includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggleSlot(s.code)}
                      className={cx("btn", active && "primary")}
                      style={{
                        width: "100%",
                        borderRadius: 16,
                        padding: "12px 10px",
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>

              <div className="muted small" style={{ marginTop: 6 }}>
                الأوقات حسب إعدادات النظام.
              </div>
            </div>

            {/* 7) العميل + المبلغ */}
            <div className="grid cols2">
              <div>
                <label className="label">اسم العميل</label>
                <input
                  className="input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="اختياري"
                />
              </div>

              <div>
                <label className="label">رقم الهاتف</label>
                <input
                  className="input"
                  dir="ltr"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="اختياري"
                />
              </div>
            </div>

            <div>
              <label className="label">المبلغ ({CURRENCY_SYMBOL})</label>
              <input
                className="input"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="اختياري"
              />
            </div>

            <div>
              <label className="label">ملاحظات</label>
              <textarea
                className="textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اختياري"
              />
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                className={cx("btn", "primary")}
                onClick={onSave}
                disabled={saving}
              >
                {saving ? "... جاري الحفظ" : "حفظ"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
