// src/lib/types.ts

// ===== enums / unions =====
export type UserRole = "admin" | "staff" | "viewer";
export type BookingStatus = "hold" | "confirmed" | "cancelled";

export type PaymentStatus = "unpaid" | "deposit" | "paid";

// أنواع الحجز (حسب طلبك)
export const BOOKING_TYPES = ["death", "mawlid", "fatiha", "wedding", "special"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

// نوع “الظهور” داخل الجدول: هل هو يوم فعالية أو تجهيز أو تنظيف
export const OCCURRENCE_KINDS = ["event", "prep", "cleanup"] as const;
export type OccurrenceKind = (typeof OCCURRENCE_KINDS)[number];

// الفترات
export type SlotCode = "morning" | "afternoon" | "night";

// ===== base tables =====
export type Hall = { id: number; name: string };

export type Slot = {
  id: number;
  code: SlotCode;
  name: string;
  start_time: string; // "08:00"
  end_time: string;   // "12:00"
};

export type Profile = {
  id: string; // uuid
  full_name: string | null;
  role: UserRole;
  active: boolean;
  created_at: string; // ISO
};

// ===== bookings =====
export type BookingRow = {
  id: number;
  title: string;

  client_name: string | null;
  client_phone: string | null;
  notes: string | null;

  status: BookingStatus;

  // النظام القديم كان payment_status نص
  // النظام الجديد: مبلغ اختياري (تقدر تخليه null)
  payment_status?: string; // legacy (اختياري)
  amount?: number | null;  // new (اختياري)

  booking_type?: BookingType | null;

  created_at: string;
  created_by: string;          // uuid
  created_by_name?: string | null; // إذا سويت join على profiles
};

// ===== booking occurrences =====
export type OccurrenceRow = {
  id: number;
  hall_id: number;
  slot_id: number;
  start_ts: string; // ISO timestamptz
  end_ts: string;   // ISO timestamptz
  booking_id: number;

  // جديد (اختياري) للتمييز داخل نفس الحجز
  kind?: OccurrenceKind | null;

  // join: bookings
  bookings?: BookingRow | null;
};
