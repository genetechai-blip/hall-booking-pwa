export type Hall = { id: number; name: string };
export type Slot = { id: number; code: "morning" | "afternoon" | "night"; name: string; start_time: string; end_time: string };

export type OccurrenceRow = {
  id: number;
  hall_id: number;
  slot_id: number;
  start_ts: string; // ISO
  end_ts: string;   // ISO
  booking_id: number;
  bookings?: {
    id: number;
    title: string;
    status: "hold" | "confirmed" | "cancelled";
    payment_status: string;
    client_name: string | null;
    client_phone: string | null;
    notes: string | null;
    created_at: string;
    created_by: string;
  } | null;
};
