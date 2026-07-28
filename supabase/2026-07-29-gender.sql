-- Carlift — gender on riders (for seating).
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to re-run.

alter table members add column if not exists gender text;        -- male | female
alter table declarations add column if not exists gender text;
