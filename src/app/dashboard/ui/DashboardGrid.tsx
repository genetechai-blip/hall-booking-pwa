// src/app/dashboard/ui/DashboardGrid.tsx
"use client";

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
  days: string[];
  occurrences: OccurrenceRow[];
  start: string;
};

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
  special: "خاصة",
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

function statusTone(status: BookingStatus): React.CSSProperties {
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

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`btn ${active ? "primary" : ""}`}
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 12px",
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  );
}

export default function DashboardGrid({ halls, slots, days, occurrences, start }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  // ✅ Default view = month
  const view = ((sp.get("view") as ViewMode) || "month") as ViewMode;
  const selectedDate = sp.get("date") || start; // day/month reference
  const hallParam = sp.get("hall") || "all";
  const hallFilter: number | "all" = hallParam === "all" ? "all" : Number(hallParam);

  const visibleHalls = hallFilter === "all" ? halls : halls.filter((h) => h.id === hallFilter);

  const occMap = (() => {
    const m = new Map<string, OccurrenceRow[]>();
    for (const o of occurrences) {
      const d = occDateISO(o.start_ts);
      const k = makeKey(o.hall_id, o.slot_id, d);
      const arr = m.get(k) || [];
      arr.push(o);
      m.set(k, arr);
    }
    return m;
  })();

  // ✅ ملخص شهري: نطلع “نوع الفعالية” بدل “مؤكد”
  const byDateSummary = (() => {
    const rankStatus: Record<BookingStatus, number> = { confirmed: 3, hold: 2, cancelled: 1 };
    const rankKind: Record<OccurrenceKind, number> = { event: 3, prep: 2, cleanup: 1 };

    type Best = {
      status: BookingStatus;
      kind: OccurrenceKind;
      bookingType: BookingType;
    };

    const best = new Map<string, Best>();

    for (const o of occurrences) {
      const d = occDateISO(o.start_ts);
      const b: any = o.bookings;
      const st = (b?.status || "hold") as BookingStatus;
      const kind = normalizeKind((o as any)?.kind);
      const bookingType = normalizeBookingType(b?.booking_type);

      const cur = best.get(d);
      if (!cur) {
        best.set(d, { status: st, kind, bookingType });
        continue;
      }

      const curScore = rankStatus[cur.status] * 10 + rankKind[cur.kind];
      const newScore = rankStatus[st] * 10 + rankKind[kind];

      if (newScore > curScore) {
        best.set(d, { status: st, kind, bookingType });
      }
    }

    return best;
  })();

  function pushParams(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });
    router.push(`/dashboard?${params.toString()}`);
  }

  function goToday() {
    const today = DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
    pushParams({ date: today, start: today });
  }

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

  const prevLabel = view === "day" ? "السابق" : view === "week" ? "السابق" : "السابق";
  const nextLabel = view === "day" ? "القادم" : view === "week" ? "القادم" : "القادم";

  function switchView(nextView: ViewMode) {
    if (nextView === "day") pushParams({ view: "day", date: selectedDate });
    else if (nextView === "week") pushParams({ view: "week", start: start || selectedDate });
    else pushParams({ view: "month", date: selectedDate });
  }

  function renderSlotCard(list: OccurrenceRow[], d: string) {
    if (!list.length) {
      return (
        <div className="card" style={{ padding: 12, borderRadius: 16 }}>
          <span className="badge">متاح</span>
          <div className="small muted" style={{ marginTop: 6 }}>لا توجد حجوزات.</div>
        </div>
      );
    }

    return (
      <div className="grid" style={{ gap: 8 }}>
        {list.map((o) => {
          const b: any = o.bookings;
          const status = (b?.status || "hold") as BookingStatus;
          const bookingType = normalizeBookingType(b?.booking_type);
          const kind = normalizeKind((o as any)?.kind);

          const createdByName = b?.profiles?.full_name || null;
          const amount = b?.amount as number | null | undefined;

          return (
            <div
              key={o.id}
              className="card"
              style={{
                padding: 12,
                borderRadius: 16,
                ...statusTone(status),
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>{b?.title || `حجز #${o.booking_id}`}</strong>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="badge">{STATUS_LABEL[status]}</span>

                  <Link
                    className="btn"
                    href={`/bookings/${o.booking_id}/edit`}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    title="تعديل"
                    aria-label="تعديل"
                  >
                    <PencilIcon />
                  </Link>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <span className="badge">{TYPE_LABEL[bookingType]}</span>
                <span className="badge">{KIND_LABEL[kind]}</span>
                {createdByName ? <span className="badge">أضيف بواسطة: {createdByName}</span> : null}
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
      <div key={`${h.id}-${d}`} className="card" style={{ padding: 12, borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 16 }}>{h.name}</strong>
          <span className="badge">{formatISODateHuman(d)}</span>
        </div>

        <div className="grid" style={{ gap: 10, marginTop: 12 }}>
          {slots.map((slot) => {
            const list = occMap.get(makeKey(h.id, slot.id, d)) || [];
            return (
              <div key={slot.id} className="card" style={{ padding: 12, borderRadius: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{slot.name}</div>
                    <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                  </div>
                  <span className="badge">{list.length ? "محجوز" : "متاح"}</span>
                </div>

                <div style={{ marginTop: 10 }}>
                  {renderSlotCard(list, d)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderWeek(h: Hall) {
    return (
      <div key={h.id} className="card" style={{ padding: 12, borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 16 }}>{h.name}</strong>
          <span className="badge">أسبوعي</span>
        </div>

        <div className="grid" style={{ gap: 10, marginTop: 12 }}>
          {days.map((d) => (
            <div key={d} className="card" style={{ padding: 12, borderRadius: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{formatISODateHuman(d)}</strong>
                <button className="btn" onClick={() => pushParams({ view: "day", date: d })} style={{ borderRadius: 999 }}>
                  عرض يومي
                </button>
              </div>

              <div className="grid" style={{ gap: 10, marginTop: 10 }}>
                {slots.map((slot) => {
                  const list = occMap.get(makeKey(h.id, slot.id, d)) || [];
                  return (
                    <div key={slot.id} className="card" style={{ padding: 12, borderRadius: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <strong>{slot.name}</strong>
                          <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                        </div>
                        <span className="badge">{list.length ? "محجوز" : "متاح"}</span>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {renderSlotCard(list, d)}
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
    const ref = DateTime.fromISO(selectedDate, { zone: BAHRAIN_TZ });
    const first = ref.startOf("month");
    const last = ref.endOf("month");

    const weekday = first.weekday; // 1=Mon..7=Sun
    const daysSinceSunday = weekday % 7;
    const gridStart = first.minus({ days: daysSinceSunday }).startOf("day");

    const lastWeekday = last.weekday;
    const daysToSaturday = (6 - (lastWeekday % 7) + 7) % 7;
    const gridEnd = last.plus({ days: daysToSaturday }).startOf("day");

    const totalDays = Math.round(gridEnd.diff(gridStart, "days").days) + 1;
    const cells = Array.from({ length: totalDays }, (_, i) => gridStart.plus({ days: i }).toISODate()!);

    return (
      <div className="card" style={{ padding: 12, borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 16 }}>{ref.toFormat("LLLL yyyy")}</strong>
          <span className="badge">شهري</span>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((w) => (
            <div key={w} className="small muted" style={{ textAlign: "center" }}>
              {w}
            </div>
          ))}

          {cells.map((d) => {
            const inMonth = DateTime.fromISO(d, { zone: BAHRAIN_TZ }).month === ref.month;

            const best = byDateSummary.get(d);
            const bg =
              best?.status === "confirmed"
                ? "rgba(220,38,38,.10)"
                : best?.status === "hold"
                ? "rgba(245,158,11,.10)"
                : best?.status === "cancelled"
                ? "rgba(107,114,128,.10)"
                : "transparent";

            const border =
              best?.status === "confirmed"
                ? "rgba(220,38,38,.35)"
                : best?.status === "hold"
                ? "rgba(245,158,11,.35)"
                : best?.status === "cancelled"
                ? "rgba(107,114,128,.35)"
                : "rgba(0,0,0,.08)";

            const label = best ? TYPE_LABEL[best.bookingType] : " ";

            return (
              <button
                key={d}
                className="card"
                onClick={() => pushParams({ view: "day", date: d })}
                style={{
                  padding: 10,
                  borderRadius: 16,
                  borderColor: border,
                  background: bg,
                  opacity: inMonth ? 1 : 0.45,
                  textAlign: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>{DateTime.fromISO(d, { zone: BAHRAIN_TZ }).day}</div>
                <div className="small muted" style={{ marginTop: 4, fontWeight: 700 }}>
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 12 }}>
      {/* Controls - مرتب وحديث */}
      <div
        className="card"
        style={{
          padding: 12,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <div className="grid" style={{ gap: 12 }}>
          {/* View tabs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <ChipButton active={view === "day"} onClick={() => switchView("day")}>يومي</ChipButton>
            <ChipButton active={view === "week"} onClick={() => switchView("week")}>أسبوعي</ChipButton>
            <ChipButton active={view === "month"} onClick={() => switchView("month")}>شهري</ChipButton>
          </div>

          {/* Date */}
          <div style={{ minWidth: 0 }}>
            <label className="label">اختر تاريخ</label>
            <input
              className="input"
              type="date"
              value={selectedDate}
              onChange={(e) => pushParams({ date: e.target.value, start: e.target.value })}
              dir="ltr"
              style={{
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                borderRadius: 16,
              }}
            />
          </div>

          {/* Hall filter */}
          <div style={{ minWidth: 0 }}>
            <label className="label">فلتر الصالة</label>
            <select
              className="select"
              value={String(hallFilter)}
              onChange={(e) => pushParams({ hall: e.target.value })}
              style={{
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                borderRadius: 16,
              }}
            >
              <option value="all">الكل</option>
              {halls.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {/* Prev/Today/Next */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <ChipButton onClick={goPrev}>{prevLabel}</ChipButton>
            <ChipButton onClick={goToday}>اليوم</ChipButton>
            <ChipButton onClick={goNext}>{nextLabel}</ChipButton>
          </div>
        </div>
      </div>

      {/* Content */}
      {view === "month"
        ? renderMonth()
        : visibleHalls.map((h) => (view === "day" ? renderDay(h, selectedDate) : renderWeek(h)))}
    </div>
  );
}
