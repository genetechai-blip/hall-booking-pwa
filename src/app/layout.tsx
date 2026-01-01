import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "نظام حجوزات الصالات",
  description: "إدارة حجوزات الصالات (PWA) للمصرّح لهم فقط",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
      </body>
    </html>
  );
}
