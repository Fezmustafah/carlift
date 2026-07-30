-- Carlift — remove every rider with no contact number, and stop new ones
-- from ever being added without one.
--
-- WHY: the paper-register import seeded riders by NAME ONLY (no phone). Those
-- names are spelled the way the register writer heard them, so when the same
-- rider checks in themselves the two records do not match and the roster grows
-- duplicates. From 5 August the riders are being registered in person, with
-- their own name and number, so the name-only rows are not worth keeping.
--
-- WHAT IS KEPT: anyone who has a phone number — self-registered (/join,
-- /checkin), collected in person (/collect, /qr), or added by hand.
-- WHAT GOES: anyone with an empty phone. Today that is exactly the rows from
-- supabase/2026-07-31-import-july-register.sql (and any register row already
-- merged away by Members → Duplicates, whose payments moved to the keeper
-- first, so nothing is lost there).
--
-- THIS DELETES JULY MONEY: a member's subscriptions are ON DELETE CASCADE, so
-- the July payment rows for name-only riders disappear from /report too. That
-- is intentional — July is written off, August is the clean start. The paper
-- amounts still exist in register/july-2026-register.csv, and step 1 below
-- keeps the per-rider totals in the database as well.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.

-- ---------------------------------------------------------------------------
-- 1. Copy the rows out before deleting them.
-- ---------------------------------------------------------------------------
create table if not exists members_purged_2026_08 (
  purged_at  timestamptz default now(),
  id         uuid,
  name       text,
  source     text,
  status     text,
  notes      text,
  paid_total numeric
);

-- No policies on this table, so only the SQL editor / service role can read it.
-- Without this line PostgREST would expose the names to the public anon key.
alter table members_purged_2026_08 enable row level security;

insert into members_purged_2026_08 (id, name, source, status, notes, paid_total)
select m.id, m.name, m.source, m.status, m.notes,
       coalesce((select sum(s.amount) from subscriptions s where s.member_id = m.id), 0)
from members m
where m.phone is null or btrim(m.phone) = '';

-- ---------------------------------------------------------------------------
-- 2. Delete them (subscriptions cascade).
-- ---------------------------------------------------------------------------
delete from members where phone is null or btrim(phone) = '';

-- ---------------------------------------------------------------------------
-- 3. Lock the door: no rider without a number, ever again.
--    The three ways a member can be created (/join, /checkin, Members → Add)
--    already demand a number, so this only guards against a bad import.
-- ---------------------------------------------------------------------------
alter table members alter column phone set not null;

alter table members drop constraint if exists members_phone_looks_real;
alter table members add constraint members_phone_looks_real
  check (length(btrim(phone)) >= 9) not valid;   -- NOT VALID: applies to new rows

-- ---------------------------------------------------------------------------
-- 4. What happened.
-- ---------------------------------------------------------------------------
select count(*) as removed, coalesce(sum(paid_total), 0) as aed_removed_from_reports
from members_purged_2026_08;

select count(*) as riders_left,
       count(*) filter (where status = 'active') as active_left
from members;

-- ---------------------------------------------------------------------------
-- UNDO — puts the names back, without their payments (those cascaded away).
-- Re-running 2026-07-31-import-july-register.sql is the fuller undo.
-- ---------------------------------------------------------------------------
-- alter table members drop constraint if exists members_phone_looks_real;
-- alter table members alter column phone drop not null;
-- insert into members (id, name, source, status, notes)
--   select id, name, source, status, notes from members_purged_2026_08;
