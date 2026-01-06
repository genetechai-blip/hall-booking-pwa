"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";

const BAHRAIN_TZ = "Asia/Bahrain";

function isoToday() {
  return DateTime.now().setZone(BAHRAIN_TZ).toISODate()!;
}

function sanitizeFilePart(x: string) {
  return x
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 60);
}

export default function ExportPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [hallId, setHallId] = useState<string>(""); // "" = all
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const today = useMemo(() => isoToday(), []);

  async function downloadExcel() {
    setMsg("");
    setDownloading(true);

    try {
      const params = new URLSearchParams();

      // ✅ بدون فلتر = لا نرسل شي
      if (from || to) {
        const a = from || to || today;
        const b = to || from || today;
        params.set("from", a);
        params.set("to", b);
      }

      if (hallId) params.set("hall_id", hallId);

      const url = `/api/bookings/export${params.toString() ? `?${params}` : ""}`;

      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j?.error ?? "فشل التصدير");
        return;
      }

      const blob = await res.blob();
      const fileUrl = URL.createObjectURL(blob);

      const rangePart =
        from || to ? `${from || to}_${to || from}` : "ALL";
      const fileName = `bookings_${hallId || "all"}_${sanitizeFilePart(rangePart)}.xlsx`;

      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(fileUrl);

      setMsg("تم تنزيل ملف Excel ✅");
    } catch {
      setMsg("صار خطأ أثناء التصدير");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-6 pb-14">
      <div className="rounded-2xl border bg-white p-4">
        <div className="text-2xl font-extrabold text-right">تصدير الحجوزات</div>
        <div className="text-sm text-muted-foreground text-right mt-1">
          اترك الفلاتر فاضية لتصدير كل الحجوزات.
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <div className="text-sm font-semibold text-right">من</div>
            <input
              dir="ltr"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-center"
            />
          </div>

          <div className="grid gap-1">
            <div className="text-sm font-semibold text-right">إلى</div>
            <input
              dir="ltr"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-center"
            />
          </div>

          <div className="grid gap-1">
            <div className="text-sm font-semibold text-right">الصالة (اختياري)</div>
            <input
              value={hallId}
              onChange={(e) => setHallId(e.target.value)}
              placeholder='مثال: 1 (اتركه فاضي للكل)'
              className="w-full rounded-xl border px-3 py-2 text-right"
              inputMode="numeric"
            />
          </div>

          <button
            onClick={downloadExcel}
            disabled={downloading}
            className="rounded-xl border px-4 py-3 font-bold"
          >
            {downloading ? "..." : "تنزيل Excel"}
          </button>

          {msg ? (
            <div className="text-sm text-right mt-1">{msg}</div>
          ) : null}

          <button
            onClick={() => history.back()}
            className="rounded-xl px-4 py-2 text-sm text-muted-foreground"
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}
