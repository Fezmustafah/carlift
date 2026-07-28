-- Carlift — record WHICH month a declaration is about.
-- Riders were answering "have you paid?" with different months in mind
-- (asked on 28 July, some assumed August). The form now names the month and
-- stores it, so the answers can never be misread later.
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to re-run.

alter table declarations add column if not exists for_month text;   -- e.g. 2026-07
