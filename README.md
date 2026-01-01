# Hall Booking PWA (Next.js + Supabase)

## 1) Requirements
- Node.js 18+ (recommended 20)
- A Supabase project with the SQL schema + RLS already applied

## 2) Setup
```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste your Supabase URL + anon key
npm run dev
```

Open: http://localhost:3000

## 3) Login
Invite-only: create users from Supabase Dashboard (Authentication → Users → Add user)

## 4) Notes
- Timezone used for creating bookings: Asia/Bahrain
- Overlap prevention is enforced by the DB constraint on booking_occurrences (tstzrange)
