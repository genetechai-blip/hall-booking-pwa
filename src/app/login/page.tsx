"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  const nextPath = useMemo(() => searchParams?.next || "/dashboard", [searchParams]);
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMsg(null);
  }, [email, password]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    window.location.href = nextPath;
  }

  return (
    <main className="container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="card" style={{ width: "min(520px, 100%)" }}>
        <h2 style={{ marginTop: 0 }}>تسجيل الدخول</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          هذا النظام للمصرّح لهم فقط.
        </p>

        <form onSubmit={onLogin} className="grid" style={{ marginTop: 14 }}>
          <div>
            <label className="label">الإيميل</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>

          <div>
            <label className="label">كلمة المرور</label>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </div>

          {msg && (
            <div className="card" style={{ borderColor: "#ffd6d6", background: "#fff5f5" }}>
              <div className="small" style={{ color: "#b00020" }}>{msg}</div>
            </div>
          )}

          <button className="btn primary" disabled={busy}>
            {busy ? "جاري الدخول..." : "دخول"}
          </button>
        </form>

        <hr />
        <div className="small muted">
          إذا نسيت كلمة المرور، غيّرها من Supabase (Authentication → Users).
        </div>
      </div>
    </main>
  );
}
