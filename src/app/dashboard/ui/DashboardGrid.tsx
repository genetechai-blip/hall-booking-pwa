"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  Hall,
  Slot,
  DashboardOccurrence,
  BookingType,
  BookingStatus,
} from "@/lib/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BAHRAIN_TZ = "Asia/Bahrain";
type ViewMode = "day" | "week" | "month";

type Props = {
  halls: Hall[];
  slots: Slot[];
  days: string[];
  start: string; // YYYY-MM-DD
  anchorDate?: string;
  occurrences: DashboardOccurrence[];
};

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function kindLabel(kind: BookingType | null | undefined) {
  switch (kind) {
    case "death":
      return "وفاة";
    case "mawlid":
      return "مولد";
    case "fatiha":
      return "فاتحة";
    case "wedding":
      return "زواج";
    case "event":
      return "فعالية";
    default:
      return "خاصة";
  }
}

// ✅ حرف واحد للموبايل
function kindShortLabel(kind: BookingType | null | undefined) {
  switch (kind) {
    case "death":
      return "و";
    case "mawlid":
      return "م";
    case "fatiha":
      return "ف";
    case "wedding":
      return "ز";
    case "event":
      return "ع"; // ✅ اختصار فعالية
    default:
      return "خ";
  }
}

function occDayISO(o: DashboardOccurrence) {
  return DateTime.fromISO(o.start_ts).setZone(BAHRAIN_TZ).toISODate()!;
}

function fmtDayHuman(iso: string) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).toFormat("ccc dd LLL");
}

function startOfWeekSunday(iso: string) {
  const ref = DateTime.fromISO(iso, { zone: BAHRAIN_TZ }).startOf("day");
  const weekday = ref.weekday; // 1=Mon .. 7=Sun
  const daysSinceSunday = weekday % 7; // Sun->0
  return ref.minus({ days: daysSinceSunday }).toISODate()!;
}

function addDays(iso: string, n: number) {
  return DateTime.fromISO(iso, { zone: BAHRAIN_TZ })
    .plus({ days: n })
    .toISODate()!;
}

function monthGridStart(anchorISO: string) {
  const d = DateTime.fromISO(anchorISO, { zone: BAHRAIN_TZ }).startOf("month");
  return startOfWeekSunday(d.toISODate()!);
}

function monthGridDays(anchorISO: string) {
  const start = monthGridStart(anchorISO);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
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
  const v = o.payment_amount ?? o.amount;
  return typeof v === "number" ? v : null;
}

function dayToneByStatus(statuses: BookingStatus[]) {
  // ألوان هادية (iOS-ish)
  if (statuses.includes("confirmed"))
    return { bg: "bg-red-50", ring: "ring-red-200", border: "border-red-200" };
  if (statuses.includes("hold"))
    return {
      bg: "bg-amber-50",
      ring: "ring-amber-200",
      border: "border-amber-200",
    };
  if (statuses.includes("cancelled"))
    return {
      bg: "bg-zinc-50",
      ring: "ring-zinc-200",
      border: "border-zinc-200",
    };
  return { bg: "bg-background", ring: "ring-border", border: "border-border" };
}

/** Icons بدون أي مكتبات إضافية */
function IconPencil({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClock({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconX({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusMiniIcon({ st }: { st: BookingStatus }) {
  const common =
    "inline-flex items-center justify-center rounded-full border bg-white/70 text-muted-foreground";
  if (st === "confirmed")
    return (
      <span className={`${common} h-5 w-5`} title="مؤكد" aria-label="مؤكد">
        <IconCheck className="h-3.5 w-3.5 text-foreground" />
      </span>
    );
  if (st === "hold")
    return (
      <span className={`${common} h-5 w-5`} title="مبدئي" aria-label="مبدئي">
        <IconClock className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className={`${common} h-5 w-5`} title="ملغي" aria-label="ملغي">
      <IconX className="h-3.5 w-3.5" />
    </span>
  );
}

export default function DashboardGrid(props: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<string>(props.anchorDate || isoToday());
  const [hallFilter, setHallFilter] = useState<number | "all">("all");

  // لو تغيّر التاريخ عبر URL نزامن الـ state
  useEffect(() => {
    if (props.anchorDate && props.anchorDate !== anchor) setAnchor(props.anchorDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.anchorDate]);

  function goToDate(nextISO: string) {
    router.replace(`/dashboard?date=${nextISO}`);
  }

  const [myName, setMyName] = useState<string>("");
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});

  // اسم المستخدم الحالي
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

  // أسماء من أضافوا الحجوزات
  useEffect(() => {
    (async () => {
      const ids = new Set<string>();
      for (const o of props.occurrences) if (o.created_by) ids.add(o.created_by);

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

  // فلترة حسب الصالة (للعرض فقط)
  const occFiltered = useMemo(() => {
    if (hallFilter === "all") return props.occurrences;
    return props.occurrences.filter((o) => o.hall_id === hallFilter);
  }, [props.occurrences, hallFilter]);

  // Map: day__hall__slot -> occurrences
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

  // ملخص الشهري: day -> { kinds[], statuses[] }
  const monthSummary = useMemo(() => {
    const summary = new Map<
      string,
      { kinds: BookingType[]; statuses: BookingStatus[] }
    >();
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

  function navPrev() {
    if (view === "day") goToDate(addDays(anchor, -1));
    else if (view === "week") goToDate(addDays(anchor, -7));
    else {
      const next = DateTime.fromISO(anchor, { zone: BAHRAIN_TZ })
        .minus({ months: 1 })
        .toISODate()!;
      goToDate(next);
    }
  }
  function navNext() {
    if (view === "day") goToDate(addDays(anchor, 1));
    else if (view === "week") goToDate(addDays(anchor, 7));
    else {
      const next = DateTime.fromISO(anchor, { zone: BAHRAIN_TZ })
        .plus({ months: 1 })
        .toISODate()!;
      goToDate(next);
    }
  }
  function navToday() {
    goToDate(isoToday());
  }

  const viewDays = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") {
      const start = startOfWeekSunday(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return monthGridDays(anchor);
  }, [view, anchor]);

  const monthTitle = useMemo(() => {
    return DateTime.fromISO(anchor, { zone: BAHRAIN_TZ }).toFormat("LLLL yyyy");
  }, [anchor]);

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-2xl font-extrabold">جدول الحجوزات</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                مستخدم: <span className="font-bold">{myName}</span>
              </div>
            </div>

            {/* Desktop actions */}
              <div className="hidden sm:flex items-center gap-2">
                <Button asChild className="rounded-xl">
                  <Link href="/bookings/new">إضافة حجز</Link>
                </Button>

                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/export">تصدير الحجوزات</Link>
                </Button>

                <Button asChild variant="secondary" className="rounded-xl">
                  <Link href="/settings">الإعدادات</Link>
                </Button>

                <Button asChild variant="outline" className="rounded-xl">
                  <a href="/api/auth/signout">خروج</a>
                </Button>
              </div>


            {/* Mobile actions */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl">
                    ⋯
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  alignOffset={6}
                  collisionPadding={14}
                  className="rounded-xl p-2"
                >
                  <DropdownMenuItem asChild>
                    <Link href="/bookings/new">إضافة حجز</Link>
                  </DropdownMenuItem>

                  {/* ✅ التصدير صار صفحة بروحه */}
                  <DropdownMenuItem asChild>
                    <Link href="/export">تصدير الحجوزات</Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link href="/settings">الإعدادات</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="/api/auth/signout">خروج</a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Separator />

          {/* Controls */}
          <div className="grid gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 rounded-2xl">
                <TabsTrigger value="month">شهري</TabsTrigger>
                <TabsTrigger value="week">أسبوعي</TabsTrigger>
                <TabsTrigger value="day">يومي</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* ✅ رجعناها 3 أعمدة مثل قبل (بدون تصدير) */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 w-full">
                <div className="text-sm font-semibold mb-1 text-right">اختر تاريخ</div>
                <div className="w-full max-w-full overflow-hidden">
                  <Input
                    dir="ltr"
                    type="date"
                    value={anchor}
                    onChange={(e) => goToDate(e.target.value)}
                    className="block w-full max-w-full min-w-0 rounded-xl text-center"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-sm font-semibold mb-1">فلتر الصالة</div>
                <Select
                  value={hallFilter === "all" ? "all" : String(hallFilter)}
                  onValueChange={(v) => setHallFilter(v === "all" ? "all" : Number(v))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">الكل</SelectItem>
                    {props.halls.map((h) => (
                      <SelectItem key={h.id} value={String(h.id)}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button variant="outline" className="rounded-xl flex-1" onClick={navPrev}>
                  السابق
                </Button>
                <Button variant="secondary" className="rounded-xl flex-1" onClick={navToday}>
                  اليوم
                </Button>
                <Button variant="outline" className="rounded-xl flex-1" onClick={navNext}>
                  القادم
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* محتوى */}
      <div className="mt-4">
        {/* Month */}
        {view === "month" && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="font-bold">{monthTitle}</div>
                <div className="text-xs text-muted-foreground">اضغط على اليوم لعرض التفاصيل</div>
              </div>
            </CardHeader>

            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-7 gap-2">
                {viewDays.map((d) => {
                  const isThisMonth =
                    DateTime.fromISO(d, { zone: BAHRAIN_TZ }).month ===
                    DateTime.fromISO(anchor, { zone: BAHRAIN_TZ }).month;

                  const sum = monthSummary.get(d);
                  const statuses = sum?.statuses || [];
                  const kinds = sum?.kinds || [];
                  const hasAny = statuses.length > 0;

                  let label = "";
                  let short = "";
                  if (kinds.length > 0) {
                    const counts = new Map<BookingType, number>();
                    for (const k of kinds) counts.set(k, (counts.get(k) || 0) + 1);

                    let best: BookingType = kinds[0];
                    let bestN = 0;
                    counts.forEach((n, k) => {
                      if (n > bestN) {
                        best = k;
                        bestN = n;
                      }
                    });
                    label = kindLabel(best);
                    short = kindShortLabel(best);
                  }

                  const tone = dayToneByStatus(statuses);

                  return (
                    <button
                      key={d}
                      onClick={() => {
                        setAnchor(d);
                        setView("day");
                      }}
                      className={[
                        "h-[56px] sm:h-[76px] w-full",
                        "rounded-2xl border",
                        "flex flex-col items-center justify-center gap-1",
                        "transition active:scale-[0.99]",
                        "px-1",
                        hasAny ? `${tone.bg} ${tone.border}` : "bg-background",
                        isThisMonth ? "opacity-100" : "opacity-40",
                      ].join(" ")}
                    >
                      <div className="text-[16px] sm:text-[18px] font-extrabold leading-none text-center">
                        {DateTime.fromISO(d, { zone: BAHRAIN_TZ }).day}
                      </div>

                      {hasAny ? (
                        <div className="w-full flex justify-center">
                          <span
                            className={[
                              "inline-flex items-center justify-center",
                              "rounded-full border bg-white/70",
                              "leading-none font-extrabold",
                              "h-5 w-5 sm:h-6 sm:w-auto sm:px-2",
                              "text-[12px] sm:text-[12px]",
                            ].join(" ")}
                            title={label}
                          >
                            <span className="sm:hidden">{short}</span>
                            <span className="hidden sm:inline truncate max-w-[72px]">{label}</span>
                          </span>
                        </div>
                      ) : (
                        <div className="h-[20px]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Day/Week */}
        {view !== "month" && (
          <div className="grid gap-3">
            {props.halls
              .filter((h) => (hallFilter === "all" ? true : h.id === hallFilter))
              .map((h) => (
                <Card key={h.id} className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-extrabold text-lg">{h.name}</div>
                      <Badge variant="secondary" className="rounded-full">
                        {fmtDayHuman(anchor)}
                      </Badge>
                    </div>
                    {view === "week" && (
                      <div className="text-xs text-muted-foreground mt-1">عرض أسبوعي (قائمة)</div>
                    )}
                  </CardHeader>

                  <CardContent className="grid gap-3 p-3 pt-0">
                    {(view === "day" ? [anchor] : viewDays.slice(0, 7)).map((d) => (
                      <Card key={`${h.id}_${d}`} className="rounded-2xl">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="font-bold truncate min-w-0">{fmtDayHuman(d)}</div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {DateTime.fromISO(d, { zone: BAHRAIN_TZ }).toFormat("dd LLL yyyy")}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="grid gap-3 p-3 pt-0">
                          {props.slots.map((s) => {
                            const key = `${d}__${h.id}__${s.id}`;
                            const list = occMap.get(key) || [];
                            const has = list.length > 0;

                            return (
                              <Card key={s.id} className="rounded-2xl">
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between gap-2 min-w-0">
                                    <div className="font-extrabold truncate min-w-0">{s.name}</div>
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                      {s.start_time} - {s.end_time}
                                    </div>
                                  </div>
                                </CardHeader>

                                <CardContent className="grid gap-2 p-3 pt-0">
                                  {!has && (
                                    <div className="text-sm text-muted-foreground">
                                      لا توجد حجوزات في هذه الفترة.
                                    </div>
                                  )}

                                  {has &&
                                    list.map((o) => {
                                      const st = occStatus(o);
                                      const kind = occType(o);
                                      const tone = dayToneByStatus([st]);
                                      const who = o.created_by
                                        ? creatorNames[o.created_by] || o.created_by
                                        : "";
                                      const amt = occAmount(o);

                                      const clientLineParts: string[] = [];
                                      if (o.client_name) clientLineParts.push(o.client_name);
                                      else if (o.client_phone) clientLineParts.push(o.client_phone);

                                      const clientLine =
                                        clientLineParts.length > 0
                                          ? `العميل: ${clientLineParts.join(" ")}`
                                          : "";

                                      const amountPart =
                                        typeof amt === "number" ? ` - ${amt} د.ب` : "";

                                      return (
                                        <div
                                          key={o.id}
                                          className={[
                                            "rounded-2xl border ring-1",
                                            "w-full max-w-full overflow-hidden",
                                            "p-2.5",
                                            tone.bg,
                                            tone.border,
                                            tone.ring,
                                          ].join(" ")}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-start gap-2 min-w-0">
                                                <div className="font-extrabold text-[15px] leading-snug truncate min-w-0">
                                                  {occTitle(o)}
                                                </div>
                                                <div className="shrink-0 mt-[2px]">
                                                  <StatusMiniIcon st={st} />
                                                </div>
                                              </div>

                                              {(clientLine || amountPart) && (
                                                <div className="text-xs text-muted-foreground mt-0.5 break-words">
                                                  {clientLine}
                                                  {amountPart}
                                                </div>
                                              )}

                                              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                                <span className="inline-flex items-center rounded-full bg-white/60 border px-2 py-0.5 font-bold">
                                                  {kindLabel(kind)}
                                                </span>

                                                {who ? (
                                                  <span className="text-muted-foreground">
                                                    بواسطة: {who}
                                                  </span>
                                                ) : null}

                                                {o.client_phone && !o.client_name ? (
                                                  <span className="text-muted-foreground">
                                                    • {o.client_phone}
                                                  </span>
                                                ) : null}
                                              </div>

                                              {o.notes ? (
                                                <div className="text-sm mt-2 whitespace-pre-wrap break-words">
                                                  {o.notes}
                                                </div>
                                              ) : null}
                                            </div>

                                            <Button
                                              asChild
                                              size="icon"
                                              variant="outline"
                                              className="rounded-xl h-9 w-9 shrink-0"
                                            >
                                              <Link
                                                href={`/bookings/${o.booking_id}/edit`}
                                                aria-label="تعديل"
                                              >
                                                <IconPencil className="h-4 w-4" />
                                              </Link>
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
