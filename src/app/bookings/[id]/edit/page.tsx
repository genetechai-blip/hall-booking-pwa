"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DateTime } from "luxon";

import type { Hall, Slot, BookingType, BookingStatus, SlotCode } from "@/lib/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BAHRAIN_TZ = "Asia/Bahrain";

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function kindLabel(kind: BookingType) {
  switch (kind) {
    case "death":
      return "وفاة";
    case "mawlid":
      return "مولد";
    case "fatiha":
      return "فاتحة";
    case "wedding":
      return "زواج";
    default:
      return "خاصة";
  }
}

function statusLabel(st: BookingStatus) {
  switch (st) {
    case "confirmed":
      return "مؤكد";
    case "hold":
      return "مبدئي";
    case "cancelled":
      return "ملغي";
  }
}

function normBookingType(v: any): BookingType {
  const x = String(v || "").toLowerCase();
  if (x === "death") return "death";
  if (x === "mawlid") return "mawlid";
  if (x === "fatiha") return "fatiha";
  if (x === "wedding") return "wedding";
  return "special";
}

function normBookingStatus(v: any): BookingStatus {
  const x = String(v || "").toLowerCase();
  if (x === "confirmed") return "confirmed";
  if (x === "cancelled") return "cancelled";
  return "hold";
}

function guessSlotCodeFromName(name?: string): SlotCode | null {
  const n = (name || "").toLowerCase();
  if (n.includes("صبح") || n.includes("morning")) return "morning";
  if (n.includes("عصر") || n.includes("afternoon")) return "afternoon";
  if (n.includes("ليل") || n.includes("night")) return "night";
  return null;
}

export default function EditBookingPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params?.id;

  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // ===== نفس ترتيب صفحة new =====
  const [title, setTitle] = useState<string>("");
  const [eventStartDate, setEventStartDate] = useState<string>(isoToday());
  const [bookingType, setBookingType] = useState<BookingType>("death");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("hold");

  const [eventDays, setEventDays] = useState<number>(1);
  const [prepDays, setPrepDays] = useState<number>(0); // التجهيز
  const [cleanDays, setCleanDays] = useState<number>(0); // التنظيف

  const [hallIds, setHallIds] = useState<number[]>([]);
  const [slotCodes, setSlotCodes] = useState<SlotCode[]>(["morning", "afternoon", "night"]);

  const [clientName, setClientName] = useState<string>("");
  const [clientPhone, setClientPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [paymentAmount, setPaymentAmount] = useState<string>("");

  // ✅ العملة ثابتة (بدون خيار إدخال)
  const currency = "د.ب";

  // تمنع overwrite لو المستخدم بدأ يعدل قبل ما يخلص fetch
  const [prefilled, setPrefilled] = useState(false);

  const slotLabel = useMemo(() => {
    const map = new Map<SlotCode, string>([
      ["morning", "الصبح"],
      ["afternoon", "العصر"],
      ["night", "الليل"],
    ]);
    return (c: SlotCode) => map.get(c) || String(c);
  }, []);

  function toggleHall(id: number) {
    setHallIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSlot(code: SlotCode) {
    setSlotCodes((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  // ===== تحميل meta + بيانات الحجز =====
  useEffect(() => {
    (async () => {
      if (!bookingId) return;

      setError("");
      setLoading(true);

      try {
        const [hRes, sRes, bRes] = await Promise.all([
          fetch("/api/meta/halls"),
          fetch("/api/meta/slots"),
          fetch(`/api/bookings/${bookingId}/get`),
        ]);

        const h = await hRes.json().catch(() => []);
        const s = await sRes.json().catch(() => []);
        const b = await bRes.json().catch(() => ({}));

        if (!bRes.ok) {
          throw new Error(b?.error || "فشل تحميل بيانات الحجز.");
        }

        setHalls(h || []);
        setSlots(s || []);

        // ===== prefill (مرة وحدة فقط) =====
        if (!prefilled) {
          // بعض الـ APIs ترجع { booking: {...} } أو ترجع السجل مباشرة
          const rec = b?.booking ?? b;

          const t = (rec?.booking_title ?? rec?.title ?? "").toString();
          setTitle(t);

          const startIso =
            (rec?.event_start_date ?? rec?.start_date ?? rec?.date ?? null) ||
            (rec?.start_ts ? DateTime.fromISO(rec.start_ts).setZone(BAHRAIN_TZ).toISODate() : null) ||
            isoToday();
          setEventStartDate(String(startIso));

          setBookingType(normBookingType(rec?.booking_type ?? rec?.kind ?? rec?.type));
          setBookingStatus(normBookingStatus(rec?.booking_status ?? rec?.status));

          setEventDays(Number(rec?.event_days ?? rec?.days ?? 1) || 1);

          // pre/post ممكن تكون بأسماء مختلفة عندك
          setPrepDays(Number(rec?.pre_days ?? rec?.before_days ?? 0) || 0);
          setCleanDays(Number(rec?.post_days ?? rec?.after_days ?? 0) || 0);

          setClientName((rec?.client_name ?? "").toString());
          setClientPhone((rec?.client_phone ?? "").toString());
          setNotes((rec?.notes ?? "").toString());

          const amt = rec?.payment_amount ?? rec?.amount ?? null;
          setPaymentAmount(typeof amt === "number" ? String(amt) : (amt ? String(amt) : ""));

          // halls: ممكن ترجع hall_ids أو halls[]
          const hallArr: number[] = Array.isArray(rec?.hall_ids)
            ? rec.hall_ids.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x))
            : Array.isArray(rec?.halls)
              ? rec.halls.map((x: any) => Number(x?.id ?? x)).filter((x: any) => Number.isFinite(x))
              : (typeof rec?.hall_id === "number" ? [rec.hall_id] : []);
          setHallIds(hallArr);

          // slots: ممكن ترجع slot_codes أو slot_ids أو slot_id
          let codes: SlotCode[] = [];
          if (Array.isArray(rec?.slot_codes)) {
            codes = rec.slot_codes
              .map((x: any) => String(x).toLowerCase())
              .filter(Boolean)
              .map((x: string) => (x === "morning" || x === "afternoon" || x === "night" ? (x as SlotCode) : null))
              .filter(Boolean) as SlotCode[];
          } else if (Array.isArray(rec?.slot_ids)) {
            const ids = rec.slot_ids.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x));
            const idToCode = new Map<number, SlotCode>();
            (s || []).forEach((sl: any) => {
              const code = (sl?.code as SlotCode) || guessSlotCodeFromName(sl?.name) || null;
              if (code && typeof sl?.id === "number") idToCode.set(sl.id, code);
            });
            codes = ids.map((id: number) => idToCode.get(id)).filter(Boolean) as SlotCode[];
          } else if (typeof rec?.slot_id === "number") {
            const one = (s || []).find((x: any) => x?.id === rec.slot_id);
            const c = (one?.code as SlotCode) || guessSlotCodeFromName(one?.name) || null;
            codes = c ? [c] : [];
          }

          // default إذا ما حصلنا شي
          if (!codes || codes.length === 0) codes = ["morning", "afternoon", "night"];
          setSlotCodes(Array.from(new Set(codes)));

          setPrefilled(true);
        }
      } catch (e: any) {
        setError(e?.message || "حصل خطأ غير متوقع.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, prefilled]);

  async function updateBooking() {
    setError("");

    if (!title.trim()) return setError("اكتب عنوان الحجز.");
    if (!eventStartDate) return setError("اختر تاريخ البداية.");
    if (eventDays < 1) return setError("عدد الأيام لازم يكون 1 أو أكثر.");
    if (hallIds.length === 0) return setError("اختر صالة واحدة على الأقل.");
    if (slotCodes.length === 0) return setError("اختر فترة واحدة على الأقل.");

    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          booking_type: bookingType,
          booking_status: bookingStatus,

          event_start_date: eventStartDate,
          event_days: Number(eventDays),
          pre_days: Number(prepDays),
          post_days: Number(cleanDays),

          hall_ids: hallIds,
          slot_codes: slotCodes,

          client_name: clientName,
          client_phone: clientPhone,
          notes,

          payment_amount: paymentAmount ? Number(paymentAmount) : null,
          currency,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "فشل تعديل الحجز.");

      window.location.href = `/dashboard?date=${eventStartDate}`;
    } catch (e: any) {
      setError(e?.message || "فشل تعديل الحجز.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-10 pt-4" dir="rtl">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-2xl font-extrabold">تعديل الحجز</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                عدّل البيانات ثم اضغط حفظ.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/dashboard">رجوع</Link>
              </Button>
            </div>
          </div>

          <Separator />
        </CardHeader>

        <CardContent className="grid gap-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">جاري تحميل بيانات الحجز…</div>
          ) : (
            <>
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {/* 1) عنوان الحجز */}
              <div className="grid gap-2">
                <div className="text-sm font-semibold">عنوان الحجز</div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl"
                  placeholder="مثال: وفاة السيد..."
                />
              </div>

              {/* 2) التاريخ */}
              <div className="grid gap-2">
                <div className="text-sm font-semibold">تاريخ البداية</div>
                <Input
                  dir="ltr"
                  type="date"
                  value={eventStartDate}
                  onChange={(e) => setEventStartDate(e.target.value)}
                  className="rounded-xl text-center"
                />
              </div>

              {/* 3) نوع الحجز */}
              <div className="grid gap-2">
                <div className="text-sm font-semibold">نوع الحجز</div>
                <Select value={bookingType} onValueChange={(v) => setBookingType(v as BookingType)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {(["death", "mawlid", "fatiha", "wedding", "special"] as BookingType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {kindLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 4) حالة الحجز */}
              <div className="grid gap-2">
                <div className="text-sm font-semibold">حالة الحجز</div>
                <Select value={bookingStatus} onValueChange={(v) => setBookingStatus(v as BookingStatus)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {(["confirmed", "hold", "cancelled"] as BookingStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 5) عدد الأيام + التجهيز/التنظيف (سكرول) */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <div className="text-sm font-semibold">عدد الأيام</div>
                  <Select value={String(eventDays)} onValueChange={(v) => setEventDays(Number(v))}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold">التجهيز</div>
                  <Select value={String(prepDays)} onValueChange={(v) => setPrepDays(Number(v))}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {Array.from({ length: 8 }, (_, i) => i).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold">التنظيف</div>
                  <Select value={String(cleanDays)} onValueChange={(v) => setCleanDays(Number(v))}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {Array.from({ length: 8 }, (_, i) => i).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 6) اختيار الصالات */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">اختر الصالات</div>
                  <Badge variant="secondary" className="rounded-full">
                    {hallIds.length} محددة
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {halls.map((h) => {
                    const active = hallIds.includes(h.id);
                    return (
                      <Button
                        key={h.id}
                        type="button"
                        variant={active ? "default" : "outline"}
                        className="rounded-xl w-full justify-center"
                        onClick={() => toggleHall(h.id)}
                      >
                        {h.name}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* 7) اختيار الفترات */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">اختر الفترات</div>
                  <Badge variant="secondary" className="rounded-full">
                    {slotCodes.length} محددة
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["morning", "afternoon", "night"] as SlotCode[]).map((code) => {
                    const active = slotCodes.includes(code);
                    return (
                      <Button
                        key={code}
                        type="button"
                        variant={active ? "default" : "outline"}
                        className="rounded-xl w-full"
                        onClick={() => toggleSlot(code)}
                      >
                        {slotLabel(code)}
                      </Button>
                    );
                  })}
                </div>

                <div className="text-xs text-muted-foreground">
                  الأوقات حسب إعدادات النظام.
                </div>
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-sm font-semibold">اسم العميل</div>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="rounded-xl"
                    placeholder="المأتم / اسم الشخص"
                  />
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold">هاتف العميل</div>
                  <Input
                    dir="ltr"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="rounded-xl"
                    placeholder="3XXXXXXXX"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-semibold">المبلغ (اختياري)</div>
                <div className="flex items-center gap-2">
                  <Input
                    dir="ltr"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="rounded-xl text-center"
                    placeholder="50"
                  />
                  <div className="text-sm font-semibold whitespace-nowrap">{currency}</div>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-semibold">ملاحظات</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  rows={4}
                  placeholder="أي تفاصيل إضافية…"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/dashboard">إلغاء</Link>
                </Button>

                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={updateBooking}
                  disabled={saving}
                >
                  {saving ? "جاري الحفظ…" : "حفظ التعديل"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
