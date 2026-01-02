"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Hall, Slot, DashboardOccurrence, BookingType, BookingStatus } from "@/lib/types";

const BAHRAIN_TZ = "Asia/Bahrain";
const LOCALE = "ar";

type ViewMode = "day" | "week" | "month";

type Props = {
  halls: Hall[];
  slots: Slot[];
  days: string[];
  start: string;
  anchorDate?: string;
  occurrences: DashboardOccurrence[];
};

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function kindLabel(kind: BookingType | null | undefined) {
  switch (kind) {
    case "death": return "وفاة";
    case "mawlid": return "مولد";
    case "fatiha": return "فاتحة";
    case "wedding": return "زواج";
    default: return "خاصة";
  }
}

function statusLabel(st: BookingStatus) {
  switch (st) {
    case "confirmed": return "مؤكد";
    case "hold": return "مبدئي";
    case "cancelled": return "ملغي";
  }
}

function occDayISO(o: DashboardOccurrence) {
  return DateTime.fromISO(o.start_ts).setZone(BAHRAIN_TZ).toISODate()!;
}

function fmtDayHuman(iso: string) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).setLocale(LOCALE).toFormat("ccc dd LLL");
}

function startOfWeekSunday(iso: string) {
  const ref = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("day");
  const weekday = ref.weekday; // 1=Mon .. 7=Sun
  const daysSinceSunday = weekday % 7; // Sun->0
  return ref.minus({ days: daysSinceSunday }).toISODate()!;
}

function addDays(iso: string, n: number) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).plus({ days: n }).toISODate()!;
}

function monthGridStart(iso: string) {
  const d = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("month");
  return startOfWeekSunday(d.toISODate()!);
}

function monthGridDays(anchorISO: string) {
  const start = monthGridStart(anchorISO);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function dayToneByStatus(statuses: BookingStatus[]) {
  if (statuses.includes("confirmed")) return { bg: "rgba(176,0,32,0.10)", border: "rgba(176,0,32,0.25)" };
  if (statuses.includes("hold")) return { bg: "rgba(255,152,0,0.12)", border: "rgba(255,152,0,0.25)" };
  if (statuses.includes("cancelled")) return { bg: "rgba(120,120,120,0.10)", border: "rgba(120,120,120,0.20)" };
  return { bg: "#fff", border: "#e9e9e9" };
}

function Icon({ name }: { name: "plus" | "gear" | "logout" | "edit" }) {
  const common = {
    width: 18, height: 18, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const
  };
  if (name === "plus") return (<svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
  if (name === "gear") return (
    <svg {...common}>
      <path d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.2-2-3.4-2.3.6a7.9 7.9 0 0 0-1.7-1l-.3-2.4h-4l-.3 2.4a7.9 7.9 0 0 0-1.7 1L6.5 9.4l-2 3.4 2 1.2a7.8 7.8 0 0 0 .1 1 7.8 7.8 0 0 0-.1 1l-2 1.2 2 3.4 2.3-.6a7.9 7.9 0 0 0 1.7 1l.3 2.4h4l.3-2.4a7.9 7.9 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2a7.8 7.8 0 0 0-.1-1z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  );
  if (name === "logout") return (
    <svg {...common}>
      <path d="M10 17l-1 0a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1" />
      <path d="M15 12H9" />
      <path d="M15 12l-3-3" />
      <path d="M15 12l-3 3" />
      <path d="M18 19V5" />
    </svg>
  );
  return (
    <svg {...common}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function occTitle(o: DashboardOccurrence) {
  return (o.booking_title ?? o.title ?? "").trim() || `حجز #${o.booking_id}`;
}
function occStatus(o: DashboardOccurrence): BookingStatus {
  return (o.booking_status ?? o.status ?? "hold") as BookingStatus;
}
function occType(o: DashboardOccurrence): BookingType {
  return (o.booking_type ?? o.kind ?? "special") as BookingType;
}
function occAmount(o: DashboardOccurrence): number | null {
  const v = (o.payment_amount ?? o.amount);
  return typeof v === "number" ? v : null;
}

export default function DashboardGrid(props: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<string>(props.anchorDate || isoToday());
  const [hallFilter, setHallFilter] = useState<number | "all">("all");

  const [myName, setMyName] = useState<string>("");
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;

      const { data: p } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", uid)
        .maybeSingle();

      const n = (p?.full_name || "").trim();
      setMyName(n || "بدون اسم");
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const ids = new Set<string>();
      for (const o of props.occurrences) {
        if ((o as any).created_by) ids.add((o as any).created_by);
      }
      const list = Array.from(ids);
      if (list.length === 0) return;

      const { data } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", list);

      const map: Record<string, string> = {};
      (data || []).forEach((x: any) => {
        map[x.id] = (x.full_name || "").trim() || x.id;
      });
      setCreatorNames(map);
    })();
  }, [supabase, props.occurrences]);

  const occFiltered = useMemo(() => {
    if (hallFilter === "all") return props.occurrences;
    return props.occurrences.filter((o) => o.hall_id === hallFilter);
  }, [props.occurrences, hallFilter]);

  const occMap = useMemo(() => {
    const map = new Map<string, DashboardOccurrence[]>();
    for (const o of occFiltered) {
      const d = occDayISO(o);
      const key = `${d}__${o.hall_id}__${o.slot_id}`;
      const arr = map.get(key) || [];
      arr.push(o);
      map.set(key, arr);
    }
    return map;
  }, [occFiltered]);

  function navPrev() {
    if (view === "day") setAnchor(addDays(anchor, -1));
    else if (view === "week") setAnchor(addDays(anchor, -7));
    else setAnchor(DateTime.fromISO(anchor, { zone: BAHRAIN_TZ }).minus({ months: 1 }).toISODate()!);
  }
  function navNext() {
    if (view === "day") setAnchor(addDays(anchor, 1));
    else if (view === "week") setAnchor(addDays(anchor, 7));
    else setAnchor(DateTime.fromISO(anchor, { zone: BAHRAIN_TZ }).plus({ months: 1 }).toISODate()!);
  }
  function navToday() {
    setAnchor(isoToday());
  }

  function daysForCurrentView(): string[] {
    if (view === "day") return [anchor];
    if (view === "week") {
      const start = startOfWeekSunday(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return monthGridDays(anchor);
  }

  const viewDays = useMemo(() => daysForCurrentView(), [view, anchor]);

  const monthSummary = useMemo(() => {
    const summary = new Map<string, { kinds: BookingType[]; statuses: BookingStatus[] }>();
    for (const o of occFiltered) {
      const d = occDayISO(o);
      const kind = occType(o);
      const st = occStatus(o);

      const cur = summary.get(d) || { kinds: [], statuses: [] };
      cur.kinds.push(kind);
      cur.statuses.push(st);
      summary.set(d, cur);
    }
    return summary;
  }, [occFiltered]);

  const cardStyle: React.CSSProperties = { borderRadius: 18, padding: 14, maxWidth: "100%", overflowX: "hidden" };

  const pillGroup: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    width: "100%",
  };

  const pillBtn = (active: boolean): React.CSSProperties => ({
    border: "1px solid #e2e2e2",
    borderRadius: 999,
    padding: "10px 12px",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#0b66c3",
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 0,
  });

  const actionBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid #e6e6e6",
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    textDecoration: "none",
    fontWeight: 800,
    color: "#0b66c3",
    whiteSpace: "nowrap",
  };

  const actionBtnPrimary: React.CSSProperties = {
    ...actionBtn,
    background: "#111",
    color: "#fff",
    borderColor: "#111",
  };

  return (
    <div className="grid" style={{ gap: 12, maxWidth: "100%", overflowX: "hidden" }}>
      {/* Header */}
      <div className="card" style={cardStyle}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 900 }}>جدول الحجوزات</div>
            <div className="muted" style={{ marginTop: 4 }}>
              مستخدم: <strong>{myName}</strong>
            </div>
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/bookings/new" style={actionBtnPrimary}>
              <Icon name="plus" />
              <span>إضافة حجز</span>
            </Link>

            <Link href="/settings" style={actionBtn}>
              <Icon name="gear" />
              <span>الإعدادات</span>
            </Link>

            <a href="/api/auth/signout" style={actionBtn}>
              <Icon name="logout" />
              <span>خروج</span>
            </a>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={cardStyle}>
        <div style={pillGroup}>
          <button style={pillBtn(view === "month")} onClick={() => setView("month")}>شهري</button>
          <button style={pillBtn(view === "week")} onClick={() => setView("week")}>أسبوعي</button>
          <button style={pillBtn(view === "day")} onClick={() => setView("day")}>يومي</button>
        </div>

        <div className="grid" style={{ marginTop: 12, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <label className="label">اختر تاريخ</label>
            <input
              className="input"
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              style={{ fontSize: 16, width: "100%", maxWidth: "100%", minWidth: 0 }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <label className="label">فلتر الصالة</label>
            <select
              className="select"
              value={hallFilter}
              onChange={(e) => setHallFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              style={{ fontSize: 16, width: "100%", maxWidth: "100%", minWidth: 0 }}
            >
              <option value="all">الكل</option>
              {props.halls.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={navPrev}>السابق</button>
            <button className="btn" onClick={navToday}>اليوم</button>
            <button className="btn" onClick={navNext}>القادم</button>
          </div>
        </div>
      </div>

      {/* Month View */}
      {view === "month" && (
        <div className="card" style={cardStyle}>
          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16 }}>
              {DateTime.fromISO(anchor, { zone: BAHRAIN_TZ }).setLocale(LOCALE).toFormat("LLLL yyyy")}
            </strong>
            <span className="muted small">اضغط على اليوم لعرض التفاصيل</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 6,
              marginTop: 12,
              width: "100%",
              maxWidth: "100%",
            }}
          >
            {viewDays.map((d) => {
              const isThisMonth =
                DateTime.fromISO(d, { zone: BAHRAIN_TZ }).month === DateTime.fromISO(anchor, { zone: BAHRAIN_TZ }).month;

              const sum = monthSummary.get(d);
              const statuses = sum?.statuses || [];
              const kinds = sum?.kinds || [];
              const hasAny = statuses.length > 0;
              const tone = dayToneByStatus(statuses);

              let label = "";
              if (kinds.length > 0) {
                const counts = new Map<BookingType, number>();
                for (const k of kinds) counts.set(k, (counts.get(k) || 0) + 1);
                let best: BookingType = kinds[0];
                let bestN = 0;
                counts.forEach((n, k) => {
                  if (n > bestN) { best = k; bestN = n; }
                });
                label = kindLabel(best);
              }

              return (
                <button
                  key={d}
                  onClick={() => { setAnchor(d); setView("day"); }}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    textAlign: "start",
                    padding: 8,
                    borderRadius: 14,
                    border: "1px solid #e9e9e9",
                    background: hasAny ? tone.bg : "#fff",
                    opacity: isThisMonth ? 1 : 0.45,
                    cursor: "pointer",
                    minHeight: 56,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 14 }}>
                    {DateTime.fromISO(d, { zone: BAHRAIN_TZ }).day}
                  </div>

                  {hasAny && (
                    <div
                      style={{
                        marginTop: 6,
                        display: "inline-flex",
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: `1px solid ${tone.border}`,
                        fontSize: 12,
                        fontWeight: 800,
                        maxWidth: "100%",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Day/Week View */}
      {view !== "month" && (
        <div className="grid" style={{ gap: 12, maxWidth: "100%", overflowX: "hidden" }}>
          {props.halls
            .filter((h) => (hallFilter === "all" ? true : h.id === hallFilter))
            .map((h) => (
              <div key={h.id} className="card" style={cardStyle}>
                <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 18 }}>{h.name}</strong>
                  <span className="badge">{fmtDayHuman(anchor)}</span>
                </div>

                {view === "week" && (
                  <div className="small muted" style={{ marginTop: 6 }}>
                    عرض أسبوعي (قائمة) — بدون سحب يمين/يسار
                  </div>
                )}

                <div className="grid" style={{ marginTop: 12 }}>
                  {(view === "day" ? [anchor] : viewDays.slice(0, 7)).map((dd) => (
                    <div key={`${h.id}_${dd}`} className="card" style={{ borderRadius: 16, padding: 12, maxWidth: "100%", overflowX: "hidden" }}>
                      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <strong>{fmtDayHuman(dd)}</strong>
                        <span className="muted small">
                          {DateTime.fromISO(dd, { zone: BAHRAIN_TZ }).setLocale(LOCALE).toFormat("dd LLL yyyy")}
                        </span>
                      </div>

                      <div className="grid" style={{ marginTop: 10, gap: 10 }}>
                        {props.slots.map((s) => {
                          const key = `${dd}__${h.id}__${s.id}`;
                          const list = occMap.get(key) || [];
                          const has = list.length > 0;

                          return (
                            <div key={s.id} className="card" style={{ borderRadius: 16, maxWidth: "100%", overflowX: "hidden" }}>
                              <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <strong style={{ fontSize: 18 }}>{s.name}</strong>
                                <span className="muted small">{s.start_time} - {s.end_time}</span>
                              </div>

                              {!has && (
                                <div className="small muted" style={{ marginTop: 6 }}>
                                  لا توجد حجوزات في هذه الفترة.
                                </div>
                              )}

                              {has && (
                                <div className="grid" style={{ marginTop: 10, gap: 10 }}>
                                  {list.map((o) => {
                                    const st = occStatus(o);
                                    const kind = occType(o);
                                    const tone = dayToneByStatus([st]);
                                    const who = (o as any).created_by ? (creatorNames[(o as any).created_by] || (o as any).created_by) : "";
                                    const amt = occAmount(o);

                                    return (
                                      <div
                                        key={o.id}
                                        className="card"
                                        style={{ borderRadius: 16, background: tone.bg, borderColor: tone.border }}
                                      >
                                        <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                          <strong style={{ fontSize: 18 }}>{occTitle(o)}</strong>

                                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                            <span className="badge">{statusLabel(st)}</span>

                                            <Link
                                              className="btn"
                                              href={`/bookings/${o.booking_id}/edit`}
                                              style={{ padding: "8px 10px", borderRadius: 12 }}
                                            >
                                              <span style={{ display: "inline-flex", alignItems: "center" }}>
                                                <Icon name="edit" />
                                              </span>
                                            </Link>
                                          </div>
                                        </div>

                                        <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                                          <span className="badge">{kindLabel(kind)}</span>
                                          {who ? <span className="badge">أضيف بواسطة: {who}</span> : null}
                                          {typeof amt === "number" ? <span className="badge">المبلغ: {amt} {(o as any).currency || ""}</span> : null}
                                        </div>

                                        {(((o as any).client_name) || ((o as any).client_phone)) && (
                                          <div className="small muted" style={{ marginTop: 10 }}>
                                            {(o as any).client_name ? `العميل: ${(o as any).client_name}` : ""}
                                            {(o as any).client_phone ? ` • ${(o as any).client_phone}` : ""}
                                          </div>
                                        )}

                                        {(o as any).notes ? (
                                          <div className="small" style={{ marginTop: 10 }}>
                                            {(o as any).notes}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
