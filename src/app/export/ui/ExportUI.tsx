"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Hall = { id: number; name: string };

export default function ExportUI({ halls }: { halls: Hall[] }) {
  const [hall, setHall] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (hall !== "all") params.set("hall_id", hall);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const qs = params.toString();
    return qs ? `/api/bookings/export?${qs}` : `/api/bookings/export`;
  }, [hall, from, to]);

  function download() {
    // يفتح تنزيل الإكسل
    window.location.href = exportUrl;
  }

  function resetAll() {
    setHall("all");
    setFrom("");
    setTo("");
  }

  return (
    <div className="mx-auto w-full max-w-xl px-3 pb-10 pt-6">
      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-extrabold">تصدير الحجوزات</CardTitle>
          <div className="text-sm text-muted-foreground">
            اترك الفلاتر فاضية لتصدير كل الحجوزات.
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-sm font-semibold">الصالة</div>
            <Select value={hall} onValueChange={setHall}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="اختر" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">كل الصالات</SelectItem>
                {halls.map((h) => (
                  <SelectItem key={h.id} value={String(h.id)}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold">من تاريخ</div>
            <Input
              type="date"
              dir="ltr"
              className="rounded-xl text-center"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold">إلى تاريخ</div>
            <Input
              type="date"
              dir="ltr"
              className="rounded-xl text-center"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button className="rounded-xl" onClick={download}>
              تنزيل Excel
            </Button>
            <Button variant="secondary" className="rounded-xl" onClick={resetAll}>
              مسح الفلاتر
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <Link className="underline" href="/dashboard">
              رجوع للداشبورد
            </Link>

            <a className="underline" href={exportUrl}>
              رابط التصدير الحالي
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
