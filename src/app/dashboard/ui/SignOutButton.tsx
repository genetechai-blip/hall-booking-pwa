"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button className="btn" onClick={signOut} disabled={busy}>
      {busy ? "..." : "خروج"}
    </button>
  );
}
