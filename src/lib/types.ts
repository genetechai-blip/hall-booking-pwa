// src/lib/types.ts

export type BookingType = "death" | "mawlid" | "fatiha" | "wedding" | "special";
export type BookingStatus = "hold" | "confirmed" | "cancelled";

export type Hall = {
  id: number;
  name: string;
};


export type SlotCode = "morning" | "afternoon" | "night" | (string & {});
export type Slot = {
  id: number;
  code: SlotCode;
  name: string;
  start_time: string;
  end_time: string;
};


/**
 * الصف اللي يرجع للداشبورد (occurrences مع بيانات booking بشكل flat)
 * NOTE: حطّيت أكثر من اسم optional كـ fallback عشان يشتغل مع اختلافات الاستعلام عندك.
 */
export type DashboardOccurrence = {
  id: number | string;

  hall_id: number;
  slot_id: number;

  start_ts: string; // ISO
  end_ts?: string | null;

  booking_id: number;

  // أسماء "مفضلة" (أحدث)
  booking_title?: string | null;
  booking_status?: BookingStatus | null;
  booking_type?: BookingType | null;

  // fallback أسماء قديمة لو موجودة في بعض الاستعلامات
  title?: string | null;
  status?: BookingStatus | null;
  kind?: BookingType | null;

  // معلومات العميل
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;

  // من أضاف الحجز
  created_by?: string | null;
  created_by_name?: string | null; // إذا أنت صرت ترجع الاسم جاهز من SQL

  // الدفع
  payment_amount?: number | null;
  amount?: number | null; // fallback
  currency?: string | null;
};

// Aliases (لو في ملفات ثانية كانت تستورد أسماء قديمة)
export type BookingKind = BookingType;
export type OccurrenceRow = DashboardOccurrence;
