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

function safeJson<T>(x: any): T {
  if (Array.isArray(x)) return x as T;
  if (x?.halls && Array.isArray(x.halls)) return x.halls as T;
  if (x?.slots && Array.isArray(x.slots)) return x.slots as T;
  if (x?.data && Array.isArray(x.data)) return x.data as T;
  return x as T;
}

function toISODateMaybe(v: any): string | "" {
  if (!v) return "";
  if (typeof v === "string") {
    // ممكن يكون ISO timestamp
    if (v.includes("T")) return DateTime.fromISO(v).setZone(BAHRAIN_TZ).toISODate() || "";
    // أو YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  return "";
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

function extractIds(anyList: any, idKeys: string[]) {
  if (!Array.isArray(anyList)) return [];
  const out: number[] = [];
  for (const item of anyList) {
    if (typeof item === "number") out.push(item);
    else if (typeof item === "string" && /^\d+$/.test(item)) out.push(Number(item));
    else if (item && typeof item === "object") {
      for (const k of idKeys) {
        const v = item[k];
        if (typeof v === "number") out.push(v);
        if (typeof v === "string" && /^\d+$/.test(v)) out.push(Number(v));
      }
    }
  }
  return Array.from(new Set(out));
}

export default function EditBookingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  // form
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [bookingType, setBookingType] = useState<BookingType>("death");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("hold");

  const [daysCount, setDaysCount] = useState<number>(1);
  const [prepDays, setPrepDays] = useState<number>(0);
  const [cleanDays, setCleanDays] = useState<number>(0);

  const [hallIds, setHallIds] = useState<number[]>([]);
  const [slotIds, setSlotIds] = useState<number[]>([]);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string>("");

  const daysOptions = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 1), []);
  const smallOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setServerError("");
      setMissing([]);

      try {
        // meta
        const [hRes, sRes] = await Promise.all([
          fetch("/api/meta/halls", { cache: "no-store" }),
          fetch("/api/meta/slots", { cache: "no-store" }),
        ]);
        const hJson = safeJson<Hall[]>(await hRes.json());
        const sJson = safeJson<Slot[]>(await sRes.json());
        setHalls(Array.isArray(hJson) ? hJson : []);
        setSlots(Array.isArray(sJson) ? sJson : []);

        // booking
        const bRes = await fetch(`/api/bookings/${id}/get`, { cache: "no-store" });
        if (!bRes.ok) {
          setServerError("تعذر جلب بيانات الحجز.");
          return;
        }
        const bAny = await bRes.json();
        const b = (bAny?.booking ?? bAny?.data ?? bAny) || {};

        // استخراج مرن (عشان اختلاف أسماء الحقول)
        const t = (b.title ?? b.booking_title ?? b.name ?? "").toString();
        const d = toISODateMaybe(b.start_date ?? b.start ?? b.start_ts ?? b.date) || "";
        const bt = (b.booking_type ?? b.kind ?? b.type ?? "death") as BookingType;
        const bs = (b.booking_status ?? b.status ?? "hold") as BookingStatus;

        const dc = Number(b.days_count ?? b.days ?? b.num_days ?? 1) || 1;
        const pd = Number(b.prep_days ?? b.before ?? b.setup ?? 0) || 0;
        const cd = Number(b.clean_days ?? b.after ?? b.cleanup ?? 0) || 0;

        // هذي أهم نقطة: halls/slots لازم ترجع كما هي من الحجز
        const hIds =
          extractIds(b.hall_ids ?? b.halls, ["id", "hall_id"]) ||
          extractIds(b.booking_halls, ["hall_id", "id"]);
        const sIds =
          extractIds(b.slot_ids ?? b.slots, ["id", "slot_id"]) ||
          extractIds(b.booking_slots, ["slot_id", "id"]);

        const cn = (b.client_name ?? b.customer_name ?? "").toString();
        const cp = (b.client_phone ?? b.customer_phone ?? "").toString();
        const am = b.payment_amount ?? b.amount;
        const nt = (b.notes ?? "").toString();

        setTitle(t);
        setStartDate(d || DateTime.now().setZone(BAHRAIN_TZ).toISODate()!);
        setBookingType(bt);
        setBookingStatus(bs);
        setDaysCount(dc);
        setPrepDays(pd);
        setCleanDays(cd);
        setHallIds(Array.isArray(hIds) ? hIds : []);
        setSlotIds(Array.isArray(sIds) ? sIds : []);
        setClientName(cn);
        setClientPhone(cp);
        setAmount(typeof am === "number" ? String(am) : am ? String(am) : "");
        setNotes(nt);

        // مهم: لا نخلي “بيانات ناقصة” تظل معلّقة بعد تعبئة الفورم
        setMissing([]);
        setServerError("");
      } catch {
        setServerError("صار خطأ أثناء تحميل البيانات.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function toggleHall(hid: number) {
    setServerError("");
    setMissing([]);
    setHallIds((prev) => (prev.includes(hid) ? prev.filter((x) => x !== hid) : [...prev, hid]));
  }

  function toggleSlot(sid: number) {
    setServerError("");
    setMissing([]);
    setSlotIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  }

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
      const payload: any = {
        id,
        booking_id: id,

        title,
        booking_title: title,

        start_date: startDate,
        start: startDate,
        date: startDate,

        booking_type: bookingType,
        kind: bookingType,
        type: bookingType,

        booking_status: bookingStatus,
        status: bookingStatus,

        days_count: daysCount,
        days: daysCount,
        num_days: daysCount,

        prep_days: prepDays,
        before: prepDays,
        setup: prepDays,

        clean_days: cleanDays,
        after: cleanDays,
        cleanup: cleanDays,

        hall_ids: hallIds,
        halls: hallIds,

        slot_ids: slotIds,
        slots: slotIds,

        client_name: clientName || null,
        client_phone: clientPhone || null,

        payment_amount: amount ? Number(amount) : null,
        amount: amount ? Number(amount) : null,

        currency: "BHD",
        notes: notes || null,
      };

      const res = await fetch(`/api/bookings/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        setServerError(txt || "فشل تحديث الحجز.");
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
              <CardTitle className="text-2xl font-extrabold">تعديل الحجز</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">عدّل البيانات ثم اضغط حفظ.</div>
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
            />
          </div>

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

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-right">اختر الصالات</div>
              <div className="text-xs text-muted-foreground">محددة: {hallIds.length}</div>
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

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-right">اختر الفترات</div>
              <div className="text-xs text-muted-foreground">محددة: {slotIds.length}</div>
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

            <div className="text-xs text-muted-foreground text-right">الأوقات حسب إعدادات النظام.</div>
          </div>

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
            <div className="text-xs text-muted-foreground text-right">بدون خيار عملة داخل الصفحة.</div>
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
