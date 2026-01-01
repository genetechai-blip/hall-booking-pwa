"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import type { Hall, Slot, OccurrenceRow } from "@/lib/types";

const BAHRAIN_TZ = "Asia/Bahrain";

type ViewMode = "day" | "week" | "month";

function todayISO() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function fmtDay(iso: string) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).toFormat("ccc dd LLL yyyy");
}

function weekStart(iso: string) {
  const d = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("day");
  const weekday = d.weekday; // Mon=1..Sun=7
  const daysFromSun = weekday === 7 ? 0 : weekday;
  return d.minus({ days: daysFromSun }).toISODate()!;
}

function addDays(iso: string, n: number) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).plus({ days: n }).toISODate()!;
}

function occKey(hallId: number, slotId: number, isoDate: string) {
  return `${hallId}|${slotId}|${isoDate}`;
}

function bookingClass(status: string) {
  if (status === "confirmed") return "booking-confirmed";
  if (status === "hold") return "booking-hold";
  if (status === "cancelled") return "booking-cancelled";
  return "";
}

function kindBadge(kind: string) {
  if (kind === "event") return "فعالية";
  if (kind === "prep") return "تجهيز";
  if (kind === "cleanup") return "تنظيف";
  return kind;
}

function kindTone(kind: string) {
  if (kind === "event") return { borderColor: "rgba(0,0,0,.15)" };
  if (kind === "prep") return { borderColor: "rgba(33,150,243,.35)", background: "rgba(33,150,243,.06)" };
  if (kind === "cleanup") return { borderColor: "rgba(76,175,80,.35)", background: "rgba(76,175,80,.06)" };
  return {};
}

export default function DashboardGrid(props: {
  halls: Hall[];
  slots: Slot[];
  days: string[];
  start: string;
  anchorDate: string;
  occurrences: OccurrenceRow[];
}) {
  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(() => props.anchorDate || props.days[0]);
  const [hallFilter, setHallFilter] = useState<number | "all">("all");

  const today = todayISO();

  // map occurrences by (hall,slot,day)
  const occMap = useMemo(() => {
    const m = new Map<string, OccurrenceRow[]>();
    for (const o of props.occurrences) {
      const d = DateTime.fromISO(o.start_ts).setZone(BAHRAIN_TZ).toISODate()!;
      const k = occKey(o.hall_id, o.slot_id, d);
      const arr = m.get(k) || [];
      arr.push(o);
      m.set(k, arr);
    }
    return m;
  }, [props.occurrences]);

  const visibleHalls = useMemo(() => {
    if (hallFilter === "all") return props.halls;
    return props.halls.filter((h) => h.id === hallFilter);
  }, [props.halls, hallFilter]);

  function goToDate(iso: string) {
    setSelectedDate(iso);
    router.push(`/dashboard?date=${iso}`);
  }

  function openDatePicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.focus();
    dateInputRef.current?.click();
  }

  // ===== Monthly grid =====
  const monthInfo = useMemo(() => {
    const d = DateTime.fromISO(selectedDate, { zone: BAHRAIN_TZ }).startOf("day");
    const monthStart = d.startOf("month");
    const monthEnd = d.endOf("month");

    // make grid start on Sunday
    const weekday = monthStart.weekday; // Mon=1..Sun=7
    const padBefore = weekday === 7 ? 0 : weekday; // Sun=0
    const gridStart = monthStart.minus({ days: padBefore });

    // 6 weeks grid (42 cells)
    const cells = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
    return { monthStart, monthEnd, cells };
  }, [selectedDate]);

  // status per day (for monthly)
  const dayStatusMap = useMemo(() => {
    const map = new Map<string, { top: "confirmed" | "hold" | "cancelled" | "none"; hasEvent: boolean; hasPrepCleanup: boolean }>();

    // decide which halls to include in monthly coloring
    const allowedHallIds = hallFilter === "all" ? null : new Set([hallFilter]);

    for (const o of props.occurrences) {
      if (allowedHallIds && !allowedHallIds.has(o.hall_id)) continue;

      const day = DateTime.fromISO(o.start_ts).setZone(BAHRAIN_TZ).toISODate()!;
      const status = (o.bookings?.status || "hold") as any;
      const kind = o.kind;

      const cur = map.get(day) || { top: "none", hasEvent: false, hasPrepCleanup: false };

      if (kind === "event") cur.hasEvent = true;
      if (kind === "prep" || kind === "cleanup") cur.hasPrepCleanup = true;

      // priority confirmed > hold > cancelled > none
      const rank: Record<string, number> = { confirmed: 3, hold: 2, cancelled: 1, none: 0 };
      if (rank[status] > rank[cur.top]) cur.top = status;

      map.set(day, cur);
    }
    return map;
  }, [props.occurrences, hallFilter]);

  function monthCellStyle(dayISO: string) {
    const s = dayStatusMap.get(dayISO);
    if (!s) return {};

    // If only prep/cleanup and no event, use subtle gray/blue-green
    if (!s.hasEvent && s.hasPrepCleanup) {
      return { background: "rgba(120,120,120,0.08)", borderColor: "rgba(120,120,120,0.25)" };
    }
    if (s.top === "confirmed") return { background: "rgba(176,0,32,0.10)", borderColor: "rgba(176,0,32,0.30)" };
    if (s.top === "hold") return { background: "rgba(255,140,0,0.14)", borderColor: "rgba(255,140,0,0.30)" };
    if (s.top === "cancelled") return { background: "rgba(120,120,120,0.10)", borderColor: "rgba(120,120,120,0.30)" };
    return {};
  }

  const prevWeek = weekStart(addDays(props.start, -7));
  const nextWeek = weekStart(addDays(props.start, 7));

  return (
    <div className="grid" style={{ gap: 12 }}>
      {/* Controls */}
      <div className="card" style={{ padding: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <Link className="btn" href={`/dashboard?date=${prevWeek}`}>الأسبوع السابق</Link>
            <Link className="btn" href={`/dashboard?date=${nextWeek}`}>الأسبوع القادم</Link>
            <button className="btn" onClick={() => goToDate(today)}>اليوم</button>
          </div>

          <div className="row">
            <Link className="btn" href="/settings">الإعدادات</Link>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 10, gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          {/* Date picker (button style) */}
          <div>
            <label className="label">التاريخ</label>
            <button type="button" className="btn" style={{ width: "100%", justifyContent: "space-between", display: "flex" }} onClick={openDatePicker}>
              <span>{fmtDay(selectedDate)}</span>
              <span className="muted">📅</span>
            </button>
            <input
              ref={dateInputRef}
              className="input"
              type="date"
              value={selectedDate}
              onChange={(e) => goToDate(e.target.value)}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
            />
          </div>

          {/* Hall filter */}
          <div>
            <label className="label">فلتر الصالة</label>
            <select
              className="select"
              value={String(hallFilter)}
              onChange={(e) => setHallFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">الكل</option>
              {props.halls.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="row" style={{ marginTop: 10 }}>
          <button className={`btn ${mode === "day" ? "primary" : ""}`} onClick={() => setMode("day")}>يومي</button>
          <button className={`btn ${mode === "week" ? "primary" : ""}`} onClick={() => setMode("week")}>أسبوعي</button>
          <button className={`btn ${mode === "month" ? "primary" : ""}`} onClick={() => setMode("month")}>شهري</button>

          <span className="badge" style={{ marginInlineStart: "auto" }}>
            Confirmed = أحمر • Hold = برتقالي • Cancelled = رمادي
          </span>
        </div>
      </div>

      {/* ===== MONTH VIEW ===== */}
      {mode === "month" ? (
        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong style={{ fontSize: 16 }}>
              {DateTime.fromISO(selectedDate, { zone: BAHRAIN_TZ }).toFormat("LLLL yyyy")}
            </strong>
            <span className="badge">اضغط على أي يوم للدخول للتفاصيل اليومية</span>
          </div>

          <div className="grid" style={{ marginTop: 10, gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {["أحد","إثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"].map((d) => (
                <div key={d} className="small muted" style={{ textAlign: "center" }}>{d}</div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {monthInfo.cells.map((c) => {
                const iso = c.toISODate()!;
                const inMonth = c.month === monthInfo.monthStart.month;
                const isToday = iso === today;
                const style = monthCellStyle(iso);

                return (
                  <button
                    key={iso}
                    className="btn"
                    onClick={() => {
                      goToDate(iso);
                      setMode("day");
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 14,
                      minHeight: 54,
                      textAlign: "center",
                      opacity: inMonth ? 1 : 0.45,
                      borderColor: isToday ? "rgba(0,0,0,.35)" : undefined,
                      ...style,
                    }}
                    type="button"
                  >
                    <div style={{ fontWeight: 700 }}>{c.day}</div>
                    <div className="small muted">{dayStatusMap.get(iso) ? "●" : ""}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== DAY / WEEK views per hall ===== */}
      {mode !== "month"
        ? visibleHalls.map((hall) => (
            <div key={hall.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong style={{ fontSize: 16 }}>{hall.name}</strong>
                <span className="badge">{mode === "day" ? "عرض يومي" : "عرض أسبوعي"}</span>
              </div>

              {mode === "day" ? (
                <div className="grid" style={{ marginTop: 10, gap: 10 }}>
                  {props.slots.map((slot) => {
                    const list = occMap.get(occKey(hall.id, slot.id, selectedDate)) || [];
                    return (
                      <div key={slot.id} className="card" style={{ padding: 12 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <div>
                            <div><strong>{slot.name}</strong></div>
                            <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                          </div>
                          <span className="badge">{list.length === 0 ? "متاح" : `${list.length} حجز`}</span>
                        </div>

                        <div className="grid" style={{ marginTop: 10, gap: 8 }}>
                          {list.length === 0 ? (
                            <div className="small muted">لا توجد حجوزات في هذه الفترة.</div>
                          ) : (
                            list.map((o) => {
                              const b = o.bookings;
                              const status = b?.status || "hold";
                              const pay = b?.payment_status || "unpaid";
                              const createdBy = b?.profiles?.full_name || "غير معروف";

                              return (
                                <div
                                  key={o.id}
                                  className={`card ${bookingClass(status)}`}
                                  style={{ padding: 12, borderRadius: 14, ...kindTone(o.kind) }}
                                >
                                  <div className="row" style={{ justifyContent: "space-between" }}>
                                    <strong style={{ fontSize: 14 }}>{b?.title || `حجز #${o.booking_id}`}</strong>
                                    <span className="badge">{status}</span>
                                  </div>

                                  <div className="row" style={{ marginTop: 8 }}>
                                    <span className="badge">{kindBadge(o.kind)}</span>
                                    <span className="badge">أضيف بواسطة: {createdBy}</span>
                                    <span className="badge">الدفع: {pay}</span>
                                  </div>

                                  <div className="small muted" style={{ marginTop: 8 }}>
                                    {b?.client_name ? `العميل: ${b.client_name}` : ""}
                                    {b?.client_phone ? ` • ${b.client_phone}` : ""}
                                  </div>

                                  {b?.notes ? <div className="small" style={{ marginTop: 8 }}>{b.notes}</div> : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 10 }}>
                  <table className="table" style={{ minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 160 }}>الفترة</th>
                        {props.days.map((d) => (
                          <th key={d}>
                            {fmtDay(d)}
                            {d === today ? " • اليوم" : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {props.slots.map((slot) => (
                        <tr key={slot.id}>
                          <td>
                            <div><strong>{slot.name}</strong></div>
                            <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                          </td>

                          {props.days.map((d) => {
                            const list = occMap.get(occKey(hall.id, slot.id, d)) || [];

                            // weekly: اختصار (فقط نوع + عنوان مختصر)
                            return (
                              <td key={d} style={d === today ? { background: "rgba(0,0,0,0.02)" } : undefined}>
                                {list.length === 0 ? (
                                  <span className="small muted">متاح</span>
                                ) : (
                                  <div className="grid" style={{ gap: 8 }}>
                                    {list.map((o) => {
                                      const b = o.bookings;
                                      const status = b?.status || "hold";
                                      const title = (b?.title || "").split(" ")[0] || "حجز";
                                      return (
                                        <div
                                          key={o.id}
                                          className={`card ${bookingClass(status)}`}
                                          style={{ padding: 10, borderRadius: 12, ...kindTone(o.kind) }}
                                        >
                                          <div className="row" style={{ justifyContent: "space-between" }}>
                                            <strong className="small">{title}</strong>
                                            <span className="badge">{kindBadge(o.kind)}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        : null}
    </div>
  );
}
