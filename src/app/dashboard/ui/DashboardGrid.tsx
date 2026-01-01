// src/app/dashboard/ui/DashboardGrid.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";

import type { Hall, Slot, OccurrenceRow, BookingStatus, BookingType, OccurrenceKind } from "@/lib/types";
import { BOOKING_TYPES } from "@/lib/types";
import { BAHRAIN_TZ, formatISODateHuman, addDaysISODate } from "@/lib/time";

type ViewMode = "day" | "week" | "month";

type Props = {
  halls: Hall[];
  slots: Slot[];
  days: string[]; // ISO date strings coming from server (for current view range)
  occurrences: OccurrenceRow[];
  start: string; // ISO anchor date
};

// ===== Labels =====
const STATUS_LABEL: Record<BookingStatus, string> = {
  hold: "مبدئي",
  confirmed: "مؤكد",
  cancelled: "ملغي",
};

const TYPE_LABEL: Record<BookingType, string> = {
  death: "وفاة",
  mawlid: "مولد",
  fatiha: "فاتحة",
  wedding: "زواج",
  special: "مناسبة خاصة",
};

const KIND_LABEL: Record<OccurrenceKind, string> = {
  event: "الفعالية",
  prep: "تجهيز",
  cleanup: "تنظيف",
};

const DEFAULT_BOOKING_TYPE: BookingType = "special";
function normalizeBookingType(v: unknown): BookingType {
  if (typeof v !== "string") return DEFAULT_BOOKING_TYPE;
  if ((BOOKING_TYPES as readonly string[]).includes(v)) return v as BookingType;
  return DEFAULT_BOOKING_TYPE;
}

function normalizeKind(v: unknown): OccurrenceKind {
  if (v === "prep" || v === "cleanup" || v === "event") return v;
  return "event";
}

// ===== UI helpers =====
function statusTone(status: BookingStatus): React.CSSProperties {
  // ألوان خفيفة (شفافة) مثل ما تبي
  if (status === "confirmed") return { borderColor: "rgba(220,38,38,.35)", background: "rgba(220,38,38,.08)" };
  if (status === "hold") return { borderColor: "rgba(245,158,11,.35)", background: "rgba(245,158,11,.08)" };
  return { borderColor: "rgba(107,114,128,.35)", background: "rgba(107,114,128,.08)" };
}

function occDateISO(startTs: string) {
  return DateTime.fromISO(startTs).setZone(BAHRAIN_TZ).toISODate()!;
}

function makeKey(hallId: number, slotId: number, isoDate: string) {
  return `${hallId}|${slotId}|${isoDate}`;
}

// ===== Component =====
export default function DashboardGrid({ halls, slots, days, occurrences, start }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const initialView = (sp.get("view") as ViewMode) || "day";
  const [view, setView] = useState<ViewMode>(initialView);

  const [hallFilter, setHallFilter] = useState<number | "all">("all");

  // day selected (for day & month view)
  const selectedDate = sp.get("date") || start;

  const occMap = useMemo(() => {
    const m = new Map<string, OccurrenceRow[]>();
    for (const o of occurrences) {
      const d = occDateISO(o.start_ts);
      const k = makeKey(o.hall_id, o.slot_id, d);
      const arr = m.get(k) || [];
      arr.push(o);
      m.set(k, arr);
    }
    return m;
  }, [occurrences]);

  const byDateAny = useMemo(() => {
    // هل اليوم فيه أي حجز (للمشهري)
    const m = new Map<string, { hasConfirmed: boolean; hasHold: boolean; hasCancelled: boolean }>();
    for (const o of occurrences) {
      const d = occDateISO(o.start_ts);
      const b = o.bookings;
      const st = (b?.status || "hold") as BookingStatus;
      const prev = m.get(d) || { hasConfirmed: false, hasHold: false, hasCancelled: false };
      if (st === "confirmed") prev.hasConfirmed = true;
      else if (st === "hold") prev.hasHold = true;
      else prev.hasCancelled = true;
      m.set(d, prev);
    }
    return m;
  }, [occurrences]);

  const visibleHalls = useMemo(() => {
    if (hallFilter === "all") return halls;
    return halls.filter((h) => h.id === hallFilter);
  }, [halls, hallFilter]);

  function pushParams(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });
    router.push(`/dashboard?${params.toString()}`);
  }

  // تنقّل حسب نوع العرض
  function goPrev() {
    if (view === "day") pushParams({ view: "day", date: addDaysISODate(selectedDate, -1) });
    else if (view === "week") pushParams({ view: "week", start: addDaysISODate(start, -7) });
    else pushParams({ view: "month", date: DateTime.fromISO(selectedDate, { zone: BAHRAIN_TZ }).minus({ months: 1 }).toISODate()! });
  }

  function goNext() {
    if (view === "day") pushParams({ view: "day", date: addDaysISODate(selectedDate, 1) });
    else if (view === "week") pushParams({ view: "week", start: addDaysISODate(start, 7) });
    else pushParams({ view: "month", date: DateTime.fromISO(selectedDate, { zone: BAHRAIN_TZ }).plus({ months: 1 }).toISODate()! });
  }

  function goToday() {
    const today = DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
    pushParams({ date: today, start: today });
  }

  // ===== Render blocks =====
  function renderSlotCard(list: OccurrenceRow[], hallId: number, slotId: number, d: string) {
    if (list.length === 0) {
      return (
        <div className="card" style={{ padding: 12, borderRadius: 14 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="badge">متاح</span>
            <span className="small muted">{formatISODateHuman(d)}</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            لا توجد حجوزات في هذه الفترة.
          </div>
        </div>
      );
    }

    return (
      <div className="grid" style={{ gap: 8 }}>
        {list.map((o) => {
          const b = o.bookings;
          const status = (b?.status || "hold") as BookingStatus;
          const bookingType = normalizeBookingType((b as any)?.booking_type);
          const kind = normalizeKind((o as any)?.kind);

          const createdBy =
            (b as any)?.created_by_name ||
            (b as any)?.created_by ||
            "";

          const amount = (b as any)?.amount as number | null | undefined;

          return (
            <div
              key={o.id}
              className="card"
              style={{
                padding: 12,
                borderRadius: 14,
                ...statusTone(status),
              }}
            >
              <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>
                  {b?.title || `حجز #${o.booking_id}`}
                </strong>

                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="badge">{STATUS_LABEL[status]}</span>
                  <Link className="btn" style={{ padding: "6px 10px" }} href={`/bookings/${o.booking_id}/edit`}>
                    تعديل
                  </Link>
                </div>
              </div>

              <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
                <span className="badge">{TYPE_LABEL[bookingType]}</span>
                <span className="badge">{KIND_LABEL[kind]}</span>
                {createdBy ? <span className="badge">أضيف بواسطة: {createdBy}</span> : null}
                {typeof amount === "number" && amount > 0 ? <span className="badge">المبلغ: {amount}</span> : null}
              </div>

              <div className="small muted" style={{ marginTop: 8 }}>
                {b?.client_name ? `العميل: ${b.client_name}` : ""}
                {b?.client_phone ? ` • ${b.client_phone}` : ""}
              </div>

              {b?.notes ? (
                <div className="small" style={{ marginTop: 8 }}>
                  {b.notes}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDay(h: Hall, d: string) {
    return (
      <div key={`${h.id}-${d}`} className="card" style={{ padding: 12, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong>{h.name}</strong>
          <span className="badge">{formatISODateHuman(d)}</span>
        </div>

        <div className="grid" style={{ gap: 10, marginTop: 10 }}>
          {slots.map((slot) => {
            const list = occMap.get(makeKey(h.id, slot.id, d)) || [];
            return (
              <div key={slot.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div><strong>{slot.name}</strong></div>
                    <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  {renderSlotCard(list, h.id, slot.id, d)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderWeek(h: Hall) {
    // أسبوع بدون جدول عريض — كل يوم Card
    return (
      <div key={h.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong>{h.name}</strong>
          <span className="badge">أسبوعي</span>
        </div>

        <div className="grid" style={{ gap: 10, marginTop: 10 }}>
          {days.map((d) => (
            <div key={d} className="card" style={{ padding: 12, borderRadius: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{formatISODateHuman(d)}</strong>
                <button className="btn" onClick={() => pushParams({ view: "day", date: d })}>
                  عرض يومي
                </button>
              </div>

              <div className="grid" style={{ gap: 10, marginTop: 10 }}>
                {slots.map((slot) => {
                  const list = occMap.get(makeKey(h.id, slot.id, d)) || [];
                  return (
                    <div key={slot.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
                      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <strong>{slot.name}</strong>
                          <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                        </div>
                        <span className="badge">{list.length ? "محجوز" : "متاح"}</span>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {renderSlotCard(list, h.id, slot.id, d)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderMonth() {
    // شهر بسيط (نحسب الشهر من selectedDate)
    const ref = DateTime.fromISO(selectedDate, { zone: BAHRAIN_TZ });
    const first = ref.startOf("month");
    const last = ref.endOf("month");

    // بداية الشبكة: نرجع لحد الأحد
    const weekday = first.weekday; // 1=Mon..7=Sun
    const daysSinceSunday = weekday % 7;
    const gridStart = first.minus({ days: daysSinceSunday }).startOf("day");

    // نهاية الشبكة: نوصل لآخر سبت
    const lastWeekday = last.weekday;
    const daysToSaturday = (6 - (lastWeekday % 7) + 7) % 7; // Sat => 6 (Sun=0)
    const gridEnd = last.plus({ days: daysToSaturday }).startOf("day");

    const totalDays = Math.round(gridEnd.diff(gridStart, "days").days) + 1;
    const cells = Array.from({ length: totalDays }, (_, i) => gridStart.plus({ days: i }).toISODate()!);

    const monthTitle = ref.toFormat("LLLL yyyy");

    return (
      <div className="card" style={{ padding: 12, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong>{monthTitle}</strong>
          <span className="badge">شهري</span>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
          {["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((w) => (
            <div key={w} className="small muted" style={{ textAlign: "center" }}>{w}</div>
          ))}

          {cells.map((d) => {
            const inMonth = DateTime.fromISO(d, { zone: BAHRAIN_TZ }).month === ref.month;
            const dot = byDateAny.get(d);
            const hasConfirmed = !!dot?.hasConfirmed;
            const hasHold = !!dot?.hasHold;
            const hasCancelled = !!dot?.hasCancelled;

            const bg = hasConfirmed
              ? "rgba(220,38,38,.10)"
              : hasHold
                ? "rgba(245,158,11,.10)"
                : hasCancelled
                  ? "rgba(107,114,128,.10)"
                  : "transparent";

            const border = hasConfirmed
              ? "rgba(220,38,38,.35)"
              : hasHold
                ? "rgba(245,158,11,.35)"
                : hasCancelled
                  ? "rgba(107,114,128,.35)"
                  : "rgba(0,0,0,.08)";

            return (
              <button
                key={d}
                className="card"
                onClick={() => pushParams({ view: "day", date: d })}
                style={{
                  padding: 10,
                  borderRadius: 14,
                  borderColor: border,
                  background: bg,
                  opacity: inMonth ? 1 : 0.45,
                  textAlign: "center",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {DateTime.fromISO(d, { zone: BAHRAIN_TZ }).day}
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {hasConfirmed ? "مؤكد" : hasHold ? "مبدئي" : hasCancelled ? "ملغي" : " "}
                </div>
              </button>
            );
          })}
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span className="badge">Confirmed = أحمر</span>
          <span className="badge">Hold = برتقالي</span>
          <span className="badge">Cancelled = رمادي</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 12 }}>
      {/* Controls */}
      <div className="card" style={{ padding: 12, borderRadius: 16 }}>
        <div className="grid" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={goPrev}>السابق</button>
              <button className="btn" onClick={goNext}>القادم</button>
              <button className="btn" onClick={goToday}>اليوم</button>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                className={`btn ${view === "day" ? "primary" : ""}`}
                onClick={() => pushParams({ view: "day" })}
              >
                يومي
              </button>
              <button
                className={`btn ${view === "week" ? "primary" : ""}`}
                onClick={() => pushParams({ view: "week" })}
              >
                أسبوعي
              </button>
              <button
                className={`btn ${view === "month" ? "primary" : ""}`}
                onClick={() => pushParams({ view: "month" })}
              >
                شهري
              </button>
            </div>
          </div>

          <div className="grid" style={{ gap: 10 }}>
            <div>
              <label className="label">اختر تاريخ</label>
              <input
                className="input"
                type="date"
                value={selectedDate}
                onChange={(e) => pushParams({ date: e.target.value, start: e.target.value })}
                style={{ maxWidth: "100%" }}
              />
            </div>

            <div>
              <label className="label">فلتر الصالة</label>
              <select
                className="select"
                value={String(hallFilter)}
                onChange={(e) => setHallFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                style={{ maxWidth: "100%" }}
              >
                <option value="all">الكل</option>
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="badge">Confirmed = أحمر</span>
            <span className="badge">Hold = برتقالي</span>
            <span className="badge">Cancelled = رمادي</span>
          </div>
        </div>
      </div>

      {/* Content */}
      {view === "month" ? (
        renderMonth()
      ) : (
        visibleHalls.map((h) => {
          if (view === "day") return renderDay(h, selectedDate);
          return renderWeek(h);
        })
      )}
    </div>
  );
}
