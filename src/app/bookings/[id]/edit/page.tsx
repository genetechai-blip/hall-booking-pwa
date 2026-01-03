"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DateTime } from "luxon";

import type { Hall, Slot, BookingType, BookingStatus } from "@/lib/types";

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

export default function EditBookingPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [halls, setHalls] = useState<Hall[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [eventStartDate, setEventStartDate] = useState<string>("");
  const [eventDays, setEventDays] = useState<number>(1);
  const [preDays, setPreDays] = useState<number>(0);
  const [postDays, setPostDays] = useState<number>(0);

  const [hallIds, setHallIds] = useState<number[]>([]);
  const [slotIds, setSlotIds] = useState<number[]>([]);

  const [title, setTitle] = useState<string>("");
  const [bookingType, setBookingType] = useState<BookingType>("death");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("confirmed");
  const [clientName, setClientName] = useState<string>("");
  const [clientPhone, setClientPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("د.ب");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const slotNameById = useMemo(() => {
    const m = new Map<number, string>();
    slots.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [slots]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const [hRes, sRes, bRes] = await Promise.all([
          fetch("/api/meta/halls"),
          fetch("/api/meta/slots"),
          fetch(`/api/bookings/${id}/get`),
        ]);

        const hallsData = await hRes.json();
        const slotsData = await sRes.json();
        const bookingData = await bRes.json();

        if (!bRes.ok) throw new Error(bookingData?.error || "فشل تحميل الحجز.");

        setHalls(hallsData || []);
        setSlots(slotsData || []);

        // payload من api/bookings/[id]/get
        setEventStartDate(bookingData.event_start_date || "");
        setEventDays(Number(bookingData.event_days || 1));
        setPreDays(Number(bookingData.pre_days || 0));
        setPostDays(Number(bookingData.post_days || 0));

        setHallIds((bookingData.hall_ids || []).map((x: any) => Number(x)));
        setSlotIds((bookingData.slot_ids || []).map((x: any) => Number(x)));

        setTitle(bookingData.title || "");
        setBookingType((bookingData.booking_type || "death") as BookingType);
        setBookingStatus((bookingData.booking_status || "hold") as BookingStatus);

        setClientName(bookingData.client_name || "");
        setClientPhone(bookingData.client_phone || "");
        setNotes(bookingData.notes || "");

        setPaymentAmount(
          typeof bookingData.payment_amount === "number"
            ? String(bookingData.payment_amount)
            : bookingData.payment_amount
            ? String(bookingData.payment_amount)
            : ""
        );
        setCurrency(bookingData.currency || "د.ب");
      } catch (e: any) {
        setError(e?.message || "فشل تحميل البيانات.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function toggleHall(hid: number) {
    setHallIds((prev) => (prev.includes(hid) ? prev.filter((x) => x !== hid) : [...prev, hid]));
  }
  function toggleSlot(sid: number) {
    setSlotIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  }

  async function save() {
    setError("");

    if (!eventStartDate) return setError("اختر تاريخ البداية.");
    if (eventDays < 1) return setError("عدد الأيام لازم يكون 1 أو أكثر.");
    if (hallIds.length === 0) return setError("اختر صالة واحدة على الأقل.");
    if (slotIds.length === 0) return setError("اختر فترة واحدة على الأقل.");

    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          booking_type: bookingType,
          booking_status: bookingStatus,
          client_name: clientName,
          client_phone: clientPhone,
          notes,
          payment_amount: paymentAmount ? Number(paymentAmount) : null,
          currency,

          event_start_date: eventStartDate,
          event_days: Number(eventDays),
          pre_days: Number(preDays),
          post_days: Number(postDays),

          hall_ids: hallIds,
          slot_ids: slotIds,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "فشل التعديل.");

      router.push(`/dashboard?date=${eventStartDate}`);
    } catch (e: any) {
      setError(e?.message || "فشل التعديل.");
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
              <CardTitle className="text-2xl font-extrabold">تعديل حجز</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                عدّل البيانات ثم احفظ.
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
            <div className="text-sm text-muted-foreground">جاري التحميل…</div>
          ) : (
            <>
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {/* التواريخ */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <div className="text-sm font-semibold mb-1">تاريخ البداية</div>
                  <Input
                    dir="ltr"
                    type="date"
                    value={eventStartDate}
                    onChange={(e) => setEventStartDate(e.target.value)}
                    className="rounded-xl text-center"
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold mb-1">عدد الأيام</div>
                  <Input
                    dir="ltr"
                    type="number"
                    min={1}
                    value={eventDays}
                    onChange={(e) => setEventDays(Number(e.target.value || 1))}
                    className="rounded-xl text-center"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-sm font-semibold mb-1">قبل</div>
                    <Input
                      dir="ltr"
                      type="number"
                      min={0}
                      value={preDays}
                      onChange={(e) => setPreDays(Number(e.target.value || 0))}
                      className="rounded-xl text-center"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">بعد</div>
                    <Input
                      dir="ltr"
                      type="number"
                      min={0}
                      value={postDays}
                      onChange={(e) => setPostDays(Number(e.target.value || 0))}
                      className="rounded-xl text-center"
                    />
                  </div>
                </div>
              </div>

              {/* الصالات */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">الصالـات</div>
                  <Badge variant="secondary" className="rounded-full">
                    {hallIds.length} محددة
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {halls.map((h) => {
                    const active = hallIds.includes(h.id);
                    return (
                      <Button
                        key={h.id}
                        type="button"
                        variant={active ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => toggleHall(h.id)}
                      >
                        {h.name}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* الفترات */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">الفترات</div>
                  <Badge variant="secondary" className="rounded-full">
                    {slotIds.length} محددة
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => {
                    const active = slotIds.includes(s.id);
                    return (
                      <Button
                        key={s.id}
                        type="button"
                        variant={active ? "secondary" : "outline"}
                        className="rounded-xl"
                        onClick={() => toggleSlot(s.id)}
                      >
                        {s.name}
                      </Button>
                    );
                  })}
                </div>

                {slotIds.length ? (
                  <div className="text-xs text-muted-foreground">
                    محدد: {slotIds.map((sid) => slotNameById.get(sid) || sid).join("، ")}
                  </div>
                ) : null}
              </div>

              {/* نوع/حالة */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold mb-1">نوع الحجز</div>
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

                <div>
                  <div className="text-sm font-semibold mb-1">حالة الحجز</div>
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
              </div>

              {/* العنوان والعميل */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="text-sm font-semibold mb-1">عنوان الحجز</div>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-xl"
                    placeholder="مثال: وفاة السيد..."
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold mb-1">اسم العميل</div>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="rounded-xl"
                    placeholder="المأتم / اسم الشخص"
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold mb-1">هاتف العميل</div>
                  <Input
                    dir="ltr"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="rounded-xl"
                    placeholder="3XXXXXXXX"
                  />
                </div>
              </div>

              {/* مبلغ + عملة */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <div className="text-sm font-semibold mb-1">المبلغ</div>
                  <Input
                    dir="ltr"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="rounded-xl"
                    placeholder="مثال: 50"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1">العملة</div>
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-xl" />
                </div>
              </div>

              {/* ملاحظات */}
              <div>
                <div className="text-sm font-semibold mb-1">ملاحظات</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  rows={4}
                  placeholder="أي تفاصيل إضافية…"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" className="rounded-xl" onClick={save} disabled={saving}>
                  {saving ? "جاري الحفظ…" : "حفظ التعديل"}
                </Button>
              </div>

              {/* معلومة لطيفة */}
              {eventStartDate ? (
                <div className="text-xs text-muted-foreground">
                  {DateTime.fromISO(eventStartDate, { zone: BAHRAIN_TZ }).toFormat("dd LLL yyyy")}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
