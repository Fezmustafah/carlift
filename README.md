# Carlift Ops

Cash-leak fix for the car-lifting business. Riders self-register via QR (`/join`), pay the owner directly; this app tracks members, payments, expiries, and occupancy. Drivers do nothing digital.

## Setup (~10 minutes)

1. **Supabase project** — [supabase.com](https://supabase.com) → New project.
2. **Schema** — SQL Editor → paste `supabase/schema.sql` → Run.
   Edit the 3 seeded cars first (driver names, plates, seats) or fix them later in Table Editor → `cars`.
3. **Login user** — Authentication → Users → Add user (email + password). This is Faiz/owner's login.
4. **Env** — copy `.env.example` to `.env`, fill from Project Settings → API:
   - `VITE_SUPABASE_URL` — Project URL
   - `VITE_SUPABASE_ANON_KEY` — anon public key
   - `VITE_OFFICE_WHATSAPP` — optional, office WhatsApp shown to riders after registering (format `9715XXXXXXXX`)
5. **Run**
   ```
   npm install
   npm run dev
   ```

## Deploy (Vercel)

Import repo/folder in Vercel → add the same 3 env vars → deploy. `vercel.json` already handles SPA routing.

## QR cards

Point any QR generator at `https://<your-domain>/join`. Print 3, laminate, hang one in each car. Rider fills the form in ~30 seconds (English + Roman Urdu labels).

## Pages

- `/join` — public rider registration (QR target). Writes `members` row with `status=pending`.
- `/login` — owner login.
- `/` — dashboard: active paid count per car per shift vs seats, collected/expenses this month, expiring count.
- `/members` — roster, search/filter, add payment (auto end-date, one-tap WhatsApp receipt), edit, add manual member.
- `/expiring` — expired last 7 days + expiring ≤3 days, one-tap WhatsApp reminder + quick renew.
- `/logs` — one-time rides, expenses, spot checks (heads counted vs paid count).

## Daily use

1. Rider registers via QR → appears as **Pending** in Members.
2. Rider pays owner → Members → **+ Payment** → WhatsApp receipt (one tap). Member becomes Active.
3. Each morning open **Expiring** → one-tap reminders. That is the whole collection job.
4. Drivers voice-note one-time rides → log in **Logs**.
5. 1–2× a month: count heads at pickup, log in **Logs → Spot checks**; the paid count fills in automatically.
