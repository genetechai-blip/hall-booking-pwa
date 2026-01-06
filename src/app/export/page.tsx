"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BAHRAIN_TZ = "Asia/Bahrain";

type Hall = { id: number; name: string };

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function sanitizeFilePart(x: string) {
  return x
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 50);
}

function isIOSStandalone() {
  // iOS PWA standalone
  const nav: any = navigator;
  return nav.standalone === true;
}

export default function ExportPage() {
  const router = useRouter();

  // إذا تبي تجيب الصالات من API عندك، بدّل هذا بكود fetch
  const halls: Hall[] = useMemo(
    () => [{ id: 0, name: "الكل" }],
    []
  );

  const [hallId, setHallId] = useState<number | "all">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function downloadExcel() {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // إذا تركتهم فاضي -> ALL
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      if (hallId !== "all") params.set("hall_id", String(hallId));

      const url = `/api/bookings/export?${params.toString()}`;

      // ✅ iOS PWA: الأفضل فتح بصفحة جديدة حتى ما يستبدل التطبيق
      if (isIOSStandalone()) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      // ✅ باقي الأجهزة: تنزيل داخل نفس الصفحة بدون navigation
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? "فشل التصدير");
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const hallName =
        hallId === "all"
          ? "all"
          : sanitizeFilePart(
              halls.find((h) => h.id === hallId)?.name ?? `hall_${hallId}`
            );

      const f = from || "ALL";
      const t = to || "ALL";

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `bookings_${hallName}_${f}_${t}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-3 pb-10 pt-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-2xl font-extrabold">تصدير الحجوزات</CardTitle>
            <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>
              رجوع
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">فلتر الصالة (اختياري)</div>
            <Select
              value={hallId === "all" ? "all" : String(hallId)}
              onValueChange={(v) => setHallId(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="اختر" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">الكل</SelectItem>
                {/* إذا عندك halls حقيقية املأها هنا */}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">من (اختياري)</div>
            <Input dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl text-center" />
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold text-right">إلى (اختياري)</div>
            <Input dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl text-center" />
          </div>

          <Button onClick={downloadExcel} disabled={loading} className="rounded-xl">
            {loading ? "..." : "تنزيل Excel"}
          </Button>

          <div className="text-xs text-muted-foreground text-right">
            * إذا تركت “من/إلى” فاضي → يحمل كل الحجوزات
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
