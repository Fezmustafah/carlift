-- Carlift — half now, half later.
--
-- A rider hands over 150 of 300 and promises the rest tomorrow. Until now the
-- register had nowhere to put that, so the promise lived in somebody's head and
-- died there. `owed` is what is still to come on that line: 0 for a full
-- payment, 150 for a half one.
--
-- It is deliberately NOT part of the end-of-day cash count. Money promised is
-- not money in the bag, and mixing the two is how a short day looks balanced.
-- It shows up in one place only: what is still to be recovered.
--
-- Run in Supabase: SQL Editor → New query → paste the WHOLE file → Run.

alter table takings add column if not exists owed numeric not null default 0;

alter table takings drop constraint if exists takings_owed_not_negative;
alter table takings add constraint takings_owed_not_negative check (owed >= 0);

-- The recover list reads this and nothing else, so it stays cheap.
create index if not exists takings_owed_idx on takings (owed) where owed > 0;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- CHECK — must print one row: owed | numeric | 0
-- ---------------------------------------------------------------------------
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'takings' and column_name = 'owed';
