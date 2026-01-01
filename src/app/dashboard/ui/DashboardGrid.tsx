"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hall, Slot, OccurrenceRow } from "@/lib/types";
import { DateTime } from "luxon";
import { BAHRAIN_TZ, formatISODateHuman, weekStartISODate, addDaysISODate, todayBahrainISODate } from "@/lib/time";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  halls: Hall[];
  slots: Slot[];
  days: string[]; // ISO date strings for the current week
  occurrences: OccurrenceRow[];
  start: string;  // week start ISO date
};

function occKey(hallId: number, slotId: number, isoDate: string) {
  return `${hallId}|${slotId}|${isoDate}`;
}

function bookingClass(status: string) {
  if (status === "confirmed") return "booking-confirmed";
  if (status === "hold") return "booking-hold";
  if (status === "cancelled") return "booking-cancelled";
  return "";
}

export default function DashboardGrid({ halls, slots, days, occurrences, start }: Props) {
  const router = useRouter();

  const [isMobile, setIsMobile] = useState(false);
  const [view, setView] = useState<"week" | "day">("week");
  const [hallFilter, setHallFilter] = useState<number | "all">("all");

  // Selected date (defaults to today if inside this week; otherwise week start)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = todayBahrainISODate();
    return days.includes(today) ? today : days[0];
  });

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 700px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    // On mobile, default to day view
    setView(isMobile ? "day" : "week");
  }, [isMobile]);

  useEffect(() => {
    // if week changes, keep selectedDate inside it
    if (!days.includes(selectedDate)) {
      const today = todayBahrainISODate();
      setSelectedDate(days.includes(today) ? today : days[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const occMap = useMemo(() => {
    const m = new Map<string, OccurrenceRow[]>();
    for (const o of occurrences) {
      const d = DateTime.fromISO(o.start_ts).setZone(BAHRAIN_TZ).toISODate()!;
      const k = occKey(o.hall_id, o.slot_id, d);
      const arr = m.get(k) || [];
      arr.push(o);
      m.set(k, arr);
    }
    return m;
  }, [occurrences]);

  const visibleHalls = useMemo(() => {
    if (hallFilter === "all") return halls;
    return halls.filter((h) => h.id === hallFilter);
  }, [halls, hallFilter]);

  const prevStart = weekStartISODate(addDaysISODate(start, -7));
  const nextStart = weekStartISODate(addDaysISODate(start, 7));

  function goToISODate(isoDate: string) {
    const wk = weekStartISODate(isoDate);
    router.push(`/dashboard?start=${wk}`);
  }

  function onPickDate(isoDate: string) {
    setSelectedDate(isoDate);
    goToISODate(isoDate);
  }

  const today = todayBahrainISODate();

  return (
    <div className="grid" style={{ gap: 12 }}>
      {/* Top controls */}
      <div className="card" style={{ padding: 12 }}>
        <div className="grid" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <Link className="btn" href={`/dashboard?start=${prevStart}`}>الأسبوع السابق</Link>
              <Link className="btn" href={`/dashboard?start=${nextStart}`}>الأسبوع القادم</Link>
              <button className="btn" onClick={() => onPickDate(today)}>اليوم</button>
            </div>

            <div className="row">
              <span className="badge">عرض: {view === "day" ? "يوم" : "أسبوع"}</span>
              <button className="btn" onClick={() => setView(view === "day" ? "week" : "day")}>
                تبديل العرض
              </button>
            </div>
          </div>

          <div className="grid" style={{ gap: 10, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr" }}>
            <div>
              <label className="label">اختر تاريخ</label>
              <input
                className="input"
                type="date"
                value={selectedDate}
                onChange={(e) => onPickDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">فلتر الصالة</label>
              <select
                className="select"
                value={String(hallFilter)}
                onChange={(e) => setHallFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">الكل</option>
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">معلومة</label>
              <div className="row">
                <span className="badge">Confirmed = أحمر</span>
                <span className="badge">Hold = برتقالي</span>
                <span className="badge">Cancelled = رمادي</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {visibleHalls.map((hall) => (
        <div key={hall.id} className="card" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong style={{ fontSize: 16 }}>{hall.name}</strong>
            <span className="badge">{view === "day" ? "عرض يومي" : "عرض أسبوعي"}</span>
          </div>

          {view === "day" ? (
            // ===== Mobile-friendly Day View (no horizontal scroll) =====
            <div className="grid" style={{ marginTop: 10 }}>
              <div className="badge" style={{ justifyContent: "center" }}>
                {formatISODateHuman(selectedDate)} {selectedDate === today ? " • اليوم" : ""}
              </div>

              {slots.map((slot) => {
                const list = occMap.get(occKey(hall.id, slot.id, selectedDate)) || [];
                return (
                  <div key={slot.id} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <div><strong>{slot.name}</strong></div>
                        <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                      </div>
                      {list.length === 0 ? (
                        <span className="badge">متاح</span>
                      ) : (
                        <span className="badge">{list.length} حجز</span>
                      )}
                    </div>

                    <div className="grid" style={{ marginTop: 10, gap: 8 }}>
                      {list.length === 0 ? (
                        <div className="small muted">لا توجد حجوزات في هذه الفترة.</div>
                      ) : (
                        list.map((o) => {
                          const b = o.bookings;
                          const status = b?.status || "hold";
                          const pay = b?.payment_status || "unpaid";
                          return (
                            <div
                              key={o.id}
                              className={`card ${bookingClass(status)}`}
                              style={{ padding: 12, borderRadius: 14 }}
                            >
                              <div className="row" style={{ justifyContent: "space-between" }}>
                                <strong style={{ fontSize: 14 }}>{b?.title || `حجز #${o.booking_id}`}</strong>
                                <span className="badge">{status}</span>
                              </div>
                              <div className="small muted" style={{ marginTop: 6 }}>
                                {pay}
                                {b?.client_name ? ` • ${b.client_name}` : ""}
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
            // ===== Desktop Week View (table) =====
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>الفترة</th>
                    {days.map((d) => (
                      <th key={d}>
                        {formatISODateHuman(d)}
                        {d === today ? " • اليوم" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.id}>
                      <td>
                        <div><strong>{slot.name}</strong></div>
                        <div className="small muted">{slot.start_time} - {slot.end_time}</div>
                      </td>

                      {days.map((d) => {
                        const list = occMap.get(occKey(hall.id, slot.id, d)) || [];
                        return (
                          <td key={d} style={d === today ? { background: "rgba(0,0,0,0.02)" } : undefined}>
                            {list.length === 0 ? (
                              <span className="small muted">متاح</span>
                            ) : (
                              <div className="grid" style={{ gap: 8 }}>
                                {list.map((o) => {
                                  const b = o.bookings;
                                  const status = b?.status || "hold";
                                  const pay = b?.payment_status || "unpaid";
                                  return (
                                    <div
                                      key={o.id}
                                      className={`card ${bookingClass(status)}`}
                                      style={{ padding: 10, borderRadius: 12 }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                        <strong className="small">{b?.title || `حجز #${o.booking_id}`}</strong>
                                        <span className="badge">{status}</span>
                                      </div>
                                      <div className="small muted" style={{ marginTop: 6 }}>
                                        {pay}{b?.client_name ? ` • ${b.client_name}` : ""}
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
      ))}
    </div>
  );
}
