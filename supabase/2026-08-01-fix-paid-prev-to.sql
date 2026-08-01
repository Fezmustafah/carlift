-- Carlift — EMERGENCY FIX (2026-08-01). Run this first, before anything else.
--
-- WHAT BROKE: 2026-08-01-checkin-two-months.sql was only partly run. Two of its
-- three columns exist (paid_prev, prev_month); paid_prev_to does not. The
-- check-in form sends all three on every submit, so PostgREST rejected the whole
-- insert with
--   PGRST204  Could not find the 'paid_prev_to' column of 'declarations'
-- for EVERY rider, whatever they answered. They saw "Could not send. Please try
-- again." and nothing reached the office. Zero rows were written — the answers
-- are gone, the riders have to be asked again.
--
-- Run in Supabase: SQL Editor → New query → paste ALL of it → Run.

alter table declarations add column if not exists paid_prev    text;  -- yes | no | na | unsure
alter table declarations add column if not exists prev_month   text;  -- e.g. 2026-07
alter table declarations add column if not exists paid_prev_to text;  -- driver | office | unsure

comment on column declarations.paid_prev is
  'Answer for prev_month. "na" = the rider was not riding that month.';
comment on column declarations.paid_prev_to is
  'Who the rider handed last month''s money to. "driver" = the leak. Asked only when paid_prev = yes.';

-- PostgREST caches the table shape. Without this the form keeps failing for a
-- minute or two after the columns exist.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- CHECK: all three must come back. If any row is missing, the ALTER above did
-- not run — scroll up in the SQL editor and read the error.
-- ---------------------------------------------------------------------------
select column_name
from information_schema.columns
where table_name = 'declarations'
  and column_name in ('paid_prev', 'prev_month', 'paid_prev_to')
order by column_name;
