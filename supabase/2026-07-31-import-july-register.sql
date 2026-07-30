-- Carlift — import the July 2026 paper register
-- 88 riders, AED 22,215. Ramesh is NOT here: no amount was written next to him.
--
-- SUPERSEDED 2026-07-29 — DO NOT RUN.
--   These riders come in without phone numbers, and the register's spellings do
--   not match how riders write their own names, so the roster filled with
--   duplicates. supabase/2026-08-01-purge-no-phone.sql removes them again and
--   blocks phone-less members from then on. Riders are being registered in
--   person from 5 August instead. Kept only as the undo for that purge, and as
--   the record of what July said.
--
-- READ THIS FIRST, IT TOUCHES MONEY:
--   * Check register/july-2026-register.csv before running — it lists every
--     name I was unsure of.
--   * Riders come in WITHOUT a phone number, because the register has none.
--     They get one when they check in through the link, and Members → Duplicates
--     then joins the two records by name.
--   * Payments are dated 1–31 July 2026. The six entries marked "A" were paid
--     by CARD and are recorded as such; everything else as cash.
--   * Isabella and Jojo each paid 150 and still owe a balance (180 and 150).
--     That is written onto their record at the bottom.
--   * "Aisha" appears twice and "Lucy"/"Luy" are two people — kept separate,
--     as confirmed. Do NOT merge them in Members → Duplicates.
--   * Every row is tagged in notes as "July 2026 register #N", so the whole
--     import can be reversed — see the bottom of this file.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.

-- The register has no phone numbers, so the column has to allow empty.
-- The unique index still blocks two riders sharing a real number.
alter table members alter column phone drop not null;

with data(k, name, amount, via) as (
  values
    (1,  'Lucy', 200, 'cash'),          (2,  'Patrisa', 150, 'cash'),
    (3,  'Rallson', 250, 'cash'),       (4,  'Edalyn', 300, 'card'),
    (5,  'Mylaaclay', 300, 'card'),     (6,  'Rosa', 300, 'cash'),
    (7,  'Maricel', 300, 'cash'),       (8,  'Jessica', 200, 'cash'),
    (9,  'Peace', 150, 'cash'),         (10, 'Joy', 350, 'cash'),
    (11, 'Erlin', 350, 'card'),         (12, 'Shubana T', 150, 'card'),
    (13, 'Munashi', 500, 'cash'),       (14, 'Arlene', 300, 'card'),
    (15, 'Lorena', 300, 'cash'),        (16, 'Ms. Sandhya', 450, 'cash'),
    (17, 'Alla', 150, 'cash'),          (18, 'Annie', 230, 'cash'),
    (19, 'Chen', 230, 'cash'),          (20, 'Qveen', 230, 'cash'),
    (21, 'Sanjeeb', 300, 'cash'),       (22, 'Pratik', 300, 'cash'),
    (23, 'Bina', 230, 'cash'),          (24, 'Nova', 230, 'cash'),
    (25, 'Ann Joy', 200, 'cash'),       (26, 'Freda', 230, 'cash'),
    (27, 'Ryass', 300, 'cash'),         (28, 'Amjad', 230, 'cash'),
    (29, 'Tajuddin', 300, 'cash'),      (30, 'Joanna Marie', 450, 'cash'),
    (31, 'Ashiq', 225, 'cash'),         (32, 'Zaki', 225, 'cash'),
    (33, 'Ransheef', 300, 'cash'),      (34, 'Clarice', 300, 'cash'),
    (35, 'Aisha', 300, 'cash'),         (36, 'Greece', 300, 'cash'),
    (37, 'Glinda', 300, 'cash'),        (38, 'Oped', 230, 'cash'),
    (39, 'Linda', 230, 'cash'),         (40, 'Irene', 350, 'cash'),
    (41, 'Shruti', 450, 'cash'),        (42, 'Jubulee', 300, 'cash'),
    (43, 'RC', 130, 'cash'),            (44, 'Akmal', 300, 'cash'),
    (45, 'Akash', 230, 'cash'),         (46, 'Luy', 350, 'cash'),
    (47, 'Darin', 250, 'cash'),         (48, 'April', 230, 'cash'),
    (49, 'Ann', 200, 'cash'),           (50, 'Stella', 230, 'cash'),
    (51, 'Agnes', 230, 'cash'),         (52, 'Hikmat', 350, 'cash'),
    (53, 'Isabella', 150, 'cash'),      (54, 'Jojo', 150, 'cash'),
    (55, 'Sultan', 300, 'cash'),        (56, 'Simmy', 300, 'cash'),
    (57, 'Sahir', 300, 'cash'),         (58, 'India', 200, 'cash'),
    (59, 'Jas', 300, 'cash'),           (60, 'Ren', 100, 'cash'),
    (61, 'Halina', 250, 'cash'),        (62, 'Paula', 200, 'cash'),
    (63, 'Charalene', 230, 'cash'),     (64, 'Cherry', 300, 'cash'),
    (65, 'Regina', 300, 'cash'),        (66, 'Farhan', 200, 'cash'),
    (67, 'Joyce', 200, 'cash'),         (68, 'Myra', 200, 'cash'),
    (69, 'Charlene', 100, 'cash'),      (70, 'Lyra', 230, 'cash'),
    (71, 'Alma', 200, 'cash'),          (72, 'Jane', 230, 'cash'),
    (73, 'Laxmi', 200, 'cash'),         (74, 'Jmiese', 300, 'cash'),
    (75, 'Katherine', 230, 'cash'),     (76, 'Sweetie', 200, 'cash'),
    (77, 'Faisal', 70, 'cash'),         (78, 'Docus', 300, 'cash'),
    (79, 'Iyenayth', 225, 'cash'),      (80, 'Lean', 230, 'cash'),
    (81, 'Gremma', 330, 'cash'),        (82, 'Suzanne', 220, 'cash'),
    (83, 'Aisha', 230, 'cash'),         (84, 'Mimi', 230, 'cash'),
    (85, 'Eva', 250, 'card'),           (86, 'Ratima', 150, 'cash'),
    (87, 'Aminah', 90, 'cash'),         (88, 'Kali', 350, 'cash')
),
ins as (
  insert into members (name, phone, status, source, notes)
  select name, null, 'active', 'manual', 'July 2026 register #' || k
  from data
  returning id, notes
)
insert into subscriptions (member_id, plan_type, amount, start_date, end_date, paid_via)
select ins.id, '30d', d.amount, date '2026-07-01', date '2026-07-31', d.via
from ins
join data d on ins.notes = 'July 2026 register #' || d.k;

-- Balances still owed from July, written where they will be seen.
update members set notes = notes || ' | still owes AED 180 from July'
  where notes = 'July 2026 register #53';   -- Isabella
update members set notes = notes || ' | still owes AED 150 from July'
  where notes = 'July 2026 register #54';   -- Jojo

-- Check: should be 88 riders and 22215.
select count(*) as riders, sum(s.amount) as total_aed
from members m
join subscriptions s on s.member_id = m.id
where m.notes like 'July 2026 register #%';

-- Check: should be 6 card payments totalling 1650.
select count(*) as card_payments, sum(s.amount) as card_total
from members m
join subscriptions s on s.member_id = m.id
where m.notes like 'July 2026 register #%' and s.paid_via = 'card';

-- ---------------------------------------------------------------------------
-- UNDO — only if the import was wrong. Removes exactly what was added above.
-- ---------------------------------------------------------------------------
-- delete from subscriptions
--   where member_id in (select id from members where notes like 'July 2026 register #%');
-- delete from members where notes like 'July 2026 register #%';
