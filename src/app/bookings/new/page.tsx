"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BAHRAIN_TZ = "Asia/Bahrain";

type Hall = { id: number; name: string };
type Slot = { id: number; name: string; start_time?: string; end_time?: string };

type BookingType = "death" | "mawlid" | "fatiha" | "wedding" | "special";
type BookingStatus = "confirmed" | "hold" | "cancelled";

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function safeJson<T>(x: any): T {
  // api ممكن يرجّع array مباشرة أو داخل object
  if (Array.isArray(x)) return x as T;
  if (x?.halls && Array.isArray(x.halls)) return x.halls as T;
  if (x?.slots && Array.isArray(x.slots)) return x.slots as T;
  if (x?.data && Array.isArray(x.data)) return x.data as T;
  return x as T;
}

function missingLabel(key: string) {
  const map: Record<string, string> = {
    title: "عنوان الحجز",
    start_date: "تاريخ البداية",
    booking_type: "نوع الحجز",
    booking_status: "حالة الحجز",
    days_count: "عدد الأيام",
    prep_days: "التجهيز",
    clean_days: "التنظيف",
    halls: "الصالات",
    slots: "الفترات",
  };
  return map[key] || key;
}

export default function NewBookingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // form
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<string>(isoToday());
  const [bookingType, setBookingType] = useState<BookingType>("death");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("hold");

  const [daysCount, setDaysCount] = useState<number>(1);
  const [prepDays, setPrepDays] = useState<number>(0);
  const [cleanDays, setCleanDays] = useState<number>(0);

  const [hallIds, setHallIds] = useState<number[]>([]);
  const [slotIds, setSlotIds] = useState<number[]>([]);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [amount, setAmount] = useState<string>(""); // بدون عملة
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string>("");

  // load meta
  useEffect(() => {
    (async () => {
      try {
        const [hRes, sRes] = await Promise.all([
          fetch("/api/meta/halls", { cache: "no-store" }),
          fetch("/api/meta/slots", { cache: "no-store" }),
        ]);
        const hJson = safeJson<Hall[]>(await hRes.json());
        const sJson = safeJson<Slot[]>(await sRes.json());
        setHalls(Array.isArray(hJson) ? hJson : []);
        setSlots(Array.isArray(sJson) ? sJson : []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleHall(id: number) {
    setServerError("");
    setMissing([]);
    setHallIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSlot(id: number) {
    setServerError("");
    setMissing([]);
    setSlotIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const hallCount = hallIds.length;
  const slotCount = slotIds.length;

  const daysOptions = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 1), []);
  const smallOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  function validate() {
    const miss: string[] = [];
    if (!title.trim()) miss.push("title");
    if (!startDate) miss.push("start_date");
    if (!bookingType) miss.push("booking_type");
    if (!bookingStatus) miss.push("booking_status");
    if (!daysCount || daysCount < 1) miss.push("days_count");
    if (prepDays < 0) miss.push("prep_days");
    if (cleanDays < 0) miss.push("clean_days");
    if (hallIds.length === 0) miss.push("halls");
    if (slotIds.length === 0) miss.push("slots");
    return miss;
  }

  async function onSubmit() {
    setServerError("");
    const miss = validate();
    setMissing(miss);
    if (miss.length) return;

    setSaving(true);
    try {
      // Payload “مرن” يدعم أكثر من تسمية (عشان ما ننكسر إذا الـ API عندك يستخدم مفاتيح مختلفة)
      const payload: any = {
        title,
        booking_title: title,

        // ✅ أسماء الحقول المطابقة للداتا بيس (والـ API)
        event_start_date: startDate,
        event_days: daysCount,
        pre_days: prepDays,
        post_days: cleanDays,
        hall_ids: hallIds,
        slot_ids: slotIds,
        status: bookingStatus,

        start_date: startDate,
        start: startDate,
        date: startDate,

        booking_type: bookingType,
        kind: bookingType,
        type: bookingType,

        booking_status: bookingStatus,
        // status مكرر فوق، لكن نخليه للمرونة
        bookingStatus: bookingStatus,

        days_count: daysCount,
        days: daysCount,
        num_days: daysCount,

        prep_days: prepDays,
        before: prepDays,
        setup: prepDays,

        clean_days: cleanDays,
        after: cleanDays,
        cleanup: cleanDays,

        
        halls: hallIds,

        slots: slotIds,

        client_name: clientName || null,
        client_phone: clientPhone || null,

        payment_amount: amount ? Number(amount) : null,
        amount: amount ? Number(amount) : null,

        currency: "BHD", // ثابت بالباك-إند لو يحتاج
        notes: notes || null,
      };

      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        setServerError(txt || "فشل إنشاء الحجز.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setServerError("صار خطأ غير متوقع.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-10 pt-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-2xl font-extrabold">إضافة حجز</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">عبّئ البيانات ثم اضغط حفظ.</div>
            </div>

            <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>
              رجوع
            </Button>
          </div>

          <Separator />

          {(missing.length > 0 || serverError) && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {serverError ? (
                <div>{serverError}</div>
              ) : (
                <div className="space-y-1">
                  <div className="font-bold">بيانات ناقصة:</div>
                  <ul className="list-disc pr-5">
                    {missing.map((k) => (
                      <li key={k}>{missingLabel(k)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="grid gap-4">
          {/* 1) عنوان الحجز */}
          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">عنوان الحجز</div>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMissing([]);
                setServerError("");
              }}
              className="rounded-xl text-right"
              placeholder="مثال: وفاة السيدة..."
            />
          </div>

          {/* 2) التاريخ */}
          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">تاريخ البداية</div>
            <Input
              dir="ltr"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setMissing([]);
                setServerError("");
              }}
              className="rounded-xl text-center"
            />
          </div>

          {/* 3) نوع الحجز */}
          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">نوع الحجز</div>
            <Select
              value={bookingType}
              onValueChange={(v) => {
                setBookingType(v as BookingType);
                setMissing([]);
                setServerError("");
              }}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="اختر" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="death">وفاة</SelectItem>
                <SelectItem value="mawlid">مولد</SelectItem>
                <SelectItem value="fatiha">فاتحة</SelectItem>
                <SelectItem value="wedding">زواج</SelectItem>
                <SelectItem value="special">خاصة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4) حالة الحجز */}
          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">حالة الحجز</div>
            <Select
              value={bookingStatus}
              onValueChange={(v) => {
                setBookingStatus(v as BookingStatus);
                setMissing([]);
                setServerError("");
              }}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="اختر" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="confirmed">مؤكد</SelectItem>
                <SelectItem value="hold">مبدئي</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5) الأيام + التجهيز + التنظيف (سكرول) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <div className="text-sm font-semibold text-right">عدد الأيام</div>
              <Select
                value={String(daysCount)}
                onValueChange={(v) => {
                  setDaysCount(Number(v));
                  setMissing([]);
                  setServerError("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {daysOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-semibold text-right">التجهيز</div>
              <Select
                value={String(prepDays)}
                onValueChange={(v) => {
                  setPrepDays(Number(v));
                  setMissing([]);
                  setServerError("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {smallOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-semibold text-right">التنظيف</div>
              <Select
                value={String(cleanDays)}
                onValueChange={(v) => {
                  setCleanDays(Number(v));
                  setMissing([]);
                  setServerError("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {smallOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 6) الصالات (كل سطر صالتين في الموبايل) */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-right">اختر الصالات</div>
              <div className="text-xs text-muted-foreground">محددة: {hallCount}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {halls.map((h) => {
                const active = hallIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => toggleHall(h.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-3 text-sm font-bold transition",
                      "text-center",
                      active
                        ? "bg-black text-white border-black"
                        : "bg-white text-black border-border",
                    ].join(" ")}
                    disabled={loading}
                  >
                    {h.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7) الفترات (عرض كامل + يتلوّن أسود عند الاختيار) */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-right">اختر الفترات</div>
              <div className="text-xs text-muted-foreground">محددة: {slotCount}</div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {slots.map((s) => {
                const active = slotIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSlot(s.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-3 text-sm font-bold transition",
                      "text-center",
                      active
                        ? "bg-black text-white border-black"
                        : "bg-white text-black border-border",
                    ].join(" ")}
                    disabled={loading}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-muted-foreground text-right">
              الأوقات حسب إعدادات النظام.
            </div>
          </div>

          {/* باقي الحقول (اختياري) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <div className="text-sm font-semibold text-right">اسم العميل (اختياري)</div>
              <Input
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  setMissing([]);
                  setServerError("");
                }}
                className="rounded-xl text-right"
              />
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-semibold text-right">هاتف العميل (اختياري)</div>
              <Input
                value={clientPhone}
                onChange={(e) => {
                  setClientPhone(e.target.value);
                  setMissing([]);
                  setServerError("");
                }}
                className="rounded-xl text-right"
                inputMode="tel"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">المبلغ (اختياري)</div>
            <Input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setMissing([]);
                setServerError("");
              }}
              className="rounded-xl text-right"
              inputMode="numeric"
              placeholder="50"
            />
            <div className="text-xs text-muted-foreground text-right">بدون اختيار عملة.</div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">ملاحظات (اختياري)</div>
            <Input
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setMissing([]);
                setServerError("");
              }}
              className="rounded-xl text-right"
              placeholder="..."
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onSubmit}
              disabled={saving || loading}
              className="rounded-xl flex-1"
            >
              {saving ? "..." : "حفظ"}
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="rounded-xl"
            >
              إلغاء
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
