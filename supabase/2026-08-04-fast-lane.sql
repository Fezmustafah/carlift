-- Carlift — the fast lane and the end-of-day cash count.
-- Replaces 2026-08-04-takings.sql (that file was never run; this one contains
-- all of it plus the phone column and the day count).
--
-- WHY A SEPARATE TABLE FOR TAKINGS: standing in front of a queue there is no
-- time for a phone number, and since 2026-08-01-purge-no-phone.sql a member row
-- without a number is refused by the database on purpose (name-only rows bred
-- duplicates). So the money lands here first — one row, one insert, nothing
-- that can block — and gets attached to a rider afterwards, sitting down.
-- Cash never waits for paperwork; the roster never gets polluted.
--
-- subscription_id is what says "this money has been counted as a plan". Until
-- it is filled the taking is real money that is not yet on anybody's record.
--
-- Run in Supabase: SQL Editor → New query → paste the WHOLE file → Run.

-- ---------------------------------------------------------------------------
-- 1. The fast lane book.
-- ---------------------------------------------------------------------------
create table if not exists takings (
  id uuid primary key,                     -- made on the phone, so a retry after
                                           -- a dead network cannot charge twice
  name text not null,
  phone text,                              -- optional, and it stays optional:
                                           -- riders give the number slowly
  amount numeric not null check (amount > 0),
  car_id uuid references cars(id),
  method text not null default 'cash',     -- cash | card | transfer
  for_month text not null,                 -- 2026-08
  taken_on date not null default current_date,
  member_id uuid references members(id) on delete set null,
  subscription_id uuid references subscriptions(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a database where the older file was already applied.
alter table takings add column if not exists phone text;

create index if not exists takings_month_idx on takings (for_month);
create index if not exists takings_taken_on_idx on takings (taken_on);
create index if not exists takings_open_idx on takings (subscription_id) where subscription_id is null;

alter table takings enable row level security;

-- Office only. No anon policy at all: this is the cash book, riders never touch it.
drop policy if exists "auth takings" on takings;
create policy "auth takings" on takings for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. The end-of-day count.
--    One row per day. `expected` is a snapshot of what the app calculated at
--    the moment of counting — kept even though it can be recalculated, because
--    what matters six weeks later is what the books said when the bag was
--    counted, not what a later edit made them say.
-- ---------------------------------------------------------------------------
create table if not exists day_closes (
  day date primary key,
  counted numeric not null check (counted >= 0),   -- notes and coins in the bag
  expected numeric not null,                       -- what the app said it should be
  fast numeric not null default 0,                 -- the parts, so a mismatch
  payments numeric not null default 0,             -- can be traced afterwards
  rides numeric not null default 0,
  spent numeric not null default 0,
  not_in_hand numeric not null default 0,          -- card + transfer that day
  riders int not null default 0,
  note text,
  closed_at timestamptz not null default now()
);

alter table day_closes enable row level security;

drop policy if exists "auth day_closes" on day_closes;
create policy "auth day_closes" on day_closes for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. Make PostgREST notice the new tables straight away.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- CHECK — this must print takings = 12 and day_closes = 11. Any other number
-- means the paste was cut off: clear the editor and paste the whole file again.
-- ---------------------------------------------------------------------------
select table_name, count(*) as columns
from information_schema.columns
where table_name in ('takings', 'day_closes')
group by table_name
order by table_name;
