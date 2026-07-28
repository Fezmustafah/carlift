-- Carlift — payment declarations (the 5–10 Aug collection drive)
-- Existing riders declare, on their own phone, whether they paid, to whom,
-- when and how much. The office then compares each claim against its own
-- records on the Verify page.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.

create table if not exists declarations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  car_id uuid references cars(id),
  shift text,                              -- morning | night | both
  plan_pref text,                          -- 15d | 30d | onetime
  paid text not null,                      -- yes | no | unsure
  paid_to text,                            -- driver | office | transfer | unsure
  paid_when date,
  amount numeric,
  note text,
  resolved boolean not null default false, -- office ticked it off
  resolved_note text,
  created_at timestamptz not null default now()
);

create index if not exists declarations_phone_idx on declarations (phone);
create index if not exists declarations_resolved_idx on declarations (resolved);

alter table declarations enable row level security;

-- Riders: may drop a declaration, may never read the pile.
create policy "anon declare" on declarations for insert to anon with check (true);
-- Office: full access.
create policy "auth declarations" on declarations for all to authenticated using (true) with check (true);

-- The check-in form also adds unknown riders to the roster, so the members
-- insert policy has to accept source = 'checkin' as well as 'qr'.
drop policy if exists "anon register" on members;
create policy "anon register" on members for insert to anon
  with check (source in ('qr', 'checkin') and status = 'pending');
