export type Hall = {
  id: number;
  name: string;
};

export type Slot = {
  id: number;
  code: "morning" | "afternoon" | "night";
  name: string;
  start_time: string;
  end_time: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  role: "admin" | "staff" | "viewer";
  active: boolean;
};

export type Booking = {
  id: number;
  title: string;
  client_name: string | null;
  client_phone: string | null;
  notes: string | null;
  status: "hold" | "confirmed" | "cancelled";
  payment_status: "unpaid" | "deposit" | "paid";
  created_by: string;

  event_start_date: string | null; // YYYY-MM-DD
  event_days: number;
  pre_days: number;
  post_days: number;

  profiles?: { full_name: string | null } | null; // join
};

export type OccurrenceRow = {
  id: number;
  booking_id: number;
  hall_id: number;
  slot_id: number;
  start_ts: string;
  end_ts: string;
  kind: "event" | "prep" | "cleanup";

  bookings?: Booking | null;
};
