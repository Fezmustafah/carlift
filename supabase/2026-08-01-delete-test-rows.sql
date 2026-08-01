-- Carlift — remove the rows left behind by the 2026-08-01 test run.
--
-- After the PGRST204 fix the whole check-in was re-tested against the live
-- database: every answer combination, the offline queue, and the RLS rules.
-- Those inserts are real rows named 'ZZ TEST …'. The public key cannot delete
-- anything (that is the point of the RLS rules), so they come out from here.
--
-- Mariam's row is NOT a test row and is not touched by this.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.

-- Look at them first.
select name, phone, paid_prev, paid_prev_to, paid, created_at
from declarations
where name like 'ZZ TEST%'
order by created_at;

delete from declarations where name like 'ZZ TEST%';
delete from members      where name like 'ZZ TEST%';

-- Both counts must be 0.
select (select count(*) from declarations where name like 'ZZ TEST%') as test_declarations_left,
       (select count(*) from members      where name like 'ZZ TEST%') as test_members_left;
