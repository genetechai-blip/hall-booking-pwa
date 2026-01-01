"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // بسيط: خلي المستخدم يكتب الاسم بدون ما نحتاج نقرأه الآن
  }, []);

  async function save() {
    setMsg(null);
    if (!fullName.trim()) return setMsg("اكتب الاسم أولًا.");

    setSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "فشل حفظ الاسم.");
      setMsg("تم حفظ الاسم ✅");
    } catch (e: any) {
      setMsg(e?.message || "صار خطأ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>إعدادات الحساب</h2>
        <Link className="btn" href="/dashboard">رجوع</Link>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <label className="label">اسم المستخدم (يظهر في الحجوزات كـ “أضيف بواسطة”)</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="مثال: محمد مهدي" />

        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </button>
          {msg ? <span className="badge">{msg}</span> : <span className="small muted">تقدر تغيّره بأي وقت</span>}
        </div>
      </div>
    </div>
  );
}
