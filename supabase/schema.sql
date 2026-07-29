-- Carlift Ops schema. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table cars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  driver_name text not null,
  driver_phone text,
  seats int not null default 7
);

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Nullable: riders seeded from the paper register have no number until they
  -- check in through the link themselves.
  phone text,
  gender text,                             -- male | female
  area text,
  pickup_point text,
  car_id uuid references cars(id),
  shift text not null default 'morning',   -- morning | night | both
  plan_pref text,                          -- 15d | 30d | onetime
  status text not null default 'pending',  -- pending | active | left
  source text not null default 'manual',   -- qr | manual
  notes text,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  plan_type text not null,                 -- 15d | 30d
  amount numeric not null,
  start_date date not null,
  end_date date not null,
  paid_via text not null default 'cash',   -- cash | transfer | link
  created_at timestamptz not null default now()
);

create table onetime_rides (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  car_id uuid references cars(id),
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  car_id uuid references cars(id),
  category text not null default 'fuel',   -- fuel | salik | maintenance | fine | other
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

-- What an existing rider says about their own payment, in their own words.
-- Compared against subscriptions on the Verify page.
create table declarations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  gender text,                             -- male | female
  car_id uuid references cars(id),
  shift text,
  plan_pref text,
  paid text not null,                      -- yes | no | unsure
  for_month text,                          -- which month the answer is about, e.g. 2026-07
  paid_to text,                            -- driver | office | transfer | unsure
  paid_when date,
  amount numeric,
  note text,
  resolved boolean not null default false,
  resolved_note text,
  created_at timestamptz not null default now()
);

create table spot_checks (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  car_id uuid references cars(id),
  shift text not null,                     -- morning | night
  heads_counted int not null,
  paid_count int not null,
  note text,
  created_at timestamptz not null default now()
);

-- Seed the 3 cars: EDIT driver names, plates, seat counts before running.
insert into cars (name, driver_name, seats) values
  ('Car 1 — Previa', 'Driver 1', 7),
  ('Car 2 — Previa', 'Driver 2', 7),
  ('Car 3 — Previa', 'Driver 3', 7);

-- One live registration per WhatsApp number. A rider marked 'left' may register
-- again later; an active one cannot register twice. The join form turns the
-- resulting unique violation into an "Already registered" screen.
create unique index members_phone_live_uniq on members (phone) where status <> 'left';

create index members_car_id_idx on members (car_id);
create index declarations_phone_idx on declarations (phone);
create index declarations_resolved_idx on declarations (resolved);
create index subscriptions_member_id_idx on subscriptions (member_id);
create index subscriptions_end_date_idx on subscriptions (end_date);

-- Row Level Security
alter table cars enable row level security;
alter table members enable row level security;
alter table declarations enable row level security;
alter table subscriptions enable row level security;
alter table onetime_rides enable row level security;
alter table expenses enable row level security;
alter table spot_checks enable row level security;

-- Public (riders via QR form): may list cars and register themselves as pending only.
create policy "anon read cars" on cars for select to anon using (true);
create policy "anon register" on members for insert to anon
  with check (source in ('qr', 'checkin') and status = 'pending');
-- Riders may drop a payment declaration; they can never read the pile.
create policy "anon declare" on declarations for insert to anon with check (true);

-- Authenticated (owner/ops): full access.
create policy "auth cars" on cars for all to authenticated using (true) with check (true);
create policy "auth members" on members for all to authenticated using (true) with check (true);
create policy "auth subscriptions" on subscriptions for all to authenticated using (true) with check (true);
create policy "auth onetime" on onetime_rides for all to authenticated using (true) with check (true);
create policy "auth expenses" on expenses for all to authenticated using (true) with check (true);
create policy "auth spot_checks" on spot_checks for all to authenticated using (true) with check (true);
create policy "auth declarations" on declarations for all to authenticated using (true) with check (true);
