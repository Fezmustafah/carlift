-- Carlift — data safety pass (2026-07-28)
-- Run in Supabase: SQL Editor → New query. Run the STEPS IN ORDER and read
-- each comment first — steps 2 and 5 change/delete rows.

-- ---------------------------------------------------------------------------
-- STEP 1 (read-only): does the same WhatsApp number appear twice?
-- Run this alone first. If it returns nothing, skip step 2.
-- ---------------------------------------------------------------------------
select phone, count(*) as rows, string_agg(name || ' [' || status || ']', ' | ') as who
from members
where status <> 'left'
group by phone
having count(*) > 1
order by count(*) desc;

-- ---------------------------------------------------------------------------
-- STEP 2 (only if step 1 returned rows): keep the OLDEST row per number,
-- mark the newer copies as 'left' so they stop counting as riders.
-- Nothing is deleted — payments stay attached to the row that keeps them.
-- Check step 1's list first and make sure they really are the same person.
-- ---------------------------------------------------------------------------
-- update members m
-- set status = 'left',
--     notes = coalesce(notes || ' | ', '') || 'duplicate registration, merged 2026-07-28'
-- where m.status <> 'left'
--   and exists (
--     select 1 from members k
--     where k.phone = m.phone
--       and k.status <> 'left'
--       and (k.created_at < m.created_at or (k.created_at = m.created_at and k.id < m.id))
--   );

-- ---------------------------------------------------------------------------
-- STEP 3: stop the same number registering twice from now on.
-- A rider marked 'left' can register again later; an active one cannot double up.
-- The app turns the resulting error into a friendly "Already registered" screen.
-- This FAILS if step 1 still shows duplicates — clear them first.
-- ---------------------------------------------------------------------------
create unique index if not exists members_phone_live_uniq
  on members (phone)
  where status <> 'left';

-- ---------------------------------------------------------------------------
-- STEP 4: real seat counts (buses, not 7-seat cars).
-- Check the names first, then run the updates that match your rows.
-- ---------------------------------------------------------------------------
select id, name, driver_name, seats from cars order by name;

-- update cars set seats = 33 where driver_name ilike '%kashif%';   -- Coaster
-- update cars set seats = 22 where driver_name ilike '%muneer%';   -- Coaster (new)
-- update cars set seats = 14 where driver_name ilike '%waseem%';   -- Hiace

-- ---------------------------------------------------------------------------
-- STEP 5: remove the leftover test row from setup day.
-- Look at it before deleting.
-- ---------------------------------------------------------------------------
select id, name, phone, created_at from members where name ilike 'ZZ TEST%';
-- delete from members where name ilike 'ZZ TEST%';

-- ---------------------------------------------------------------------------
-- STEP 6: indexes — the member list and dashboard join on these every load.
-- ---------------------------------------------------------------------------
create index if not exists members_car_id_idx on members (car_id);
create index if not exists subscriptions_member_id_idx on subscriptions (member_id);
create index if not exists subscriptions_end_date_idx on subscriptions (end_date);
