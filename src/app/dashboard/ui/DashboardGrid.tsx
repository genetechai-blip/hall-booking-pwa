"use client";

import { useMemo, useState } from "react";
import type { Hall, Slot, OccurrenceRow } from "@/lib/types";
import { DateTime } from "luxon";
import { BAHRAIN_TZ, formatISODateHuman, weekStartISODate, addDaysISODate } from "@/lib/time";
import Link from "next/link";

type Props = {
  halls: Hall[];
  slots: Slot[];
  days: string[]; // ISO date strings
  occurrences: OccurrenceRow[];
  start: string;  // ISO date
};

function occKey(hallId: number, slotId: number, isoDate: string) {
  return `${hallId}|${slotId}|${isoDate}`;
}

export default function DashboardGrid({ halls, slots, days, occurrences, start }: Props) {
  const [hallFilter, setHallFilter] = useState<number | "all">("all");

  const occMap = useMemo(() => {
    const m = new Map<string, OccurrenceRow[]>();
    for (const o of occurrences) {
      // Convert start_ts to Bahrain date for grouping
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
    return halls.filter(h => h.id === hallFilter);
  }, [halls, hallFilter]);

  const prevStart = weekStartISODate(addDaysISODate(start, -7));
  const nextStart = weekStartISODate(addDaysISODate(start, 7));

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <Link className="btn" href={`/dashboard?start=${prevStart}`}>الأسبوع السابق</Link>
          <Link className="btn" href={`/dashboard?start=${nextStart}`}>الأسبوع القادم</Link>
        </div>

        <div className="row">
          <span className="small muted">فلتر الصالة:</span>
          <select className="select" style={{ width: 220 }} value={String(hallFilter)}
            onChange={(e) => setHallFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
            <option value="all">الكل</option>
            {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>

      {visibleHalls.map((hall) => (
        <div key={hall.id} className="card" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{hall.name}</strong>
            <span className="badge">أسبوعي</span>
          </div>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>الفترة</th>
                  {days.map((d) => (
                    <th key={d}>{formatISODateHuman(d)}</th>
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
                        <td key={d}>
                          {list.length === 0 ? (
                            <span className="small muted">متاح</span>
                          ) : (
                            <div className="grid" style={{ gap: 8 }}>
                              {list.map((o) => {
                                const b = o.bookings;
                                const status = b?.status || "hold";
                                const pay = b?.payment_status || "unpaid";
                                return (
                                  <div key={o.id} className="card" style={{ padding: 10, borderRadius: 12 }}>
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
        </div>
      ))}
    </div>
  );
}
