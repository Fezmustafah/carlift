-- Carlift — the check-in now asks about TWO months, and nothing else.
--
-- The round happens on the 5th of every month, in person at the pickup point,
-- with a queue waiting. Four questions only: full name, WhatsApp number,
-- "did you pay for <last month>?", "and for <this month>?". Gender, car,
-- pickup point, amount, date and "who did you give it to" are no longer asked
-- — the car comes from the ?car= in the QR link, the rest is what the office
-- already knows.
--
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to re-run.

alter table declarations add column if not exists paid_prev text;    -- yes | no | na | unsure
alter table declarations add column if not exists prev_month text;   -- e.g. 2026-07

comment on column declarations.paid_prev is
  'Answer for prev_month. "na" = the rider was not riding that month.';

-- Old rows kept their paid_to / paid_when / amount answers; new rows leave them
-- empty. Verify handles both.
