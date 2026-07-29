-- Carlift — import the July 2026 paper register
-- 88 riders, AED 22,215. Ramesh is NOT here: no amount was written next to him.
--
-- READ THIS FIRST, IT TOUCHES MONEY:
--   * Check the queries you were sent (register/july-2026-register.csv) before running.
--   * Riders come in WITHOUT a phone number, because the register has none.
--     They get one when they check in through the link, and Members → Duplicates
--     then joins the two records by name.
--   * Every payment is recorded as cash for 1–31 July 2026.
--   * Each row is tagged in notes as "July 2026 register #N" so the whole
--     import can be undone in one go — see the bottom of this file.
--
-- Run in Supabase: SQL Editor → New query → paste → Run.

-- The register has no phone numbers, so the column has to allow empty.
-- The unique index still blocks two riders sharing a real number.
alter table members alter column phone drop not null;

with data(k, name, amount) as (
  values
    (1,  'Lucy', 200),          (2,  'Patrisa', 150),      (3,  'Rallson', 250),
    (4,  'Edalyn', 300),        (5,  'Mylaaclay', 300),    (6,  'Rosa', 300),
    (7,  'Maricel', 300),       (8,  'Jessica', 200),      (9,  'Peace', 150),
    (10, 'Joy', 350),           (11, 'Erlin', 350),        (12, 'Shubana T', 150),
    (13, 'Munashi', 500),       (14, 'Arlene', 300),       (15, 'Lorena', 300),
    (16, 'Ms. Sandhya', 450),   (17, 'Alla', 150),         (18, 'Annie', 230),
    (19, 'Chen', 230),          (20, 'Qveen', 230),        (21, 'Sanjeeb', 300),
    (22, 'Pratik', 300),        (23, 'Bina', 230),         (24, 'Nova', 230),
    (25, 'Ann Joy', 200),       (26, 'Freda', 230),        (27, 'Ryass', 300),
    (28, 'Amjad', 230),         (29, 'Tajuddin', 300),     (30, 'Joanna Marie', 450),
    (31, 'Ashiq', 225),         (32, 'Zaki', 225),         (33, 'Ransheef', 300),
    (34, 'Clarice', 300),       (35, 'Aisha', 300),        (36, 'Greece', 300),
    (37, 'Glinda', 300),        (38, 'Oped', 230),         (39, 'Linda', 230),
    (40, 'Irene', 350),         (41, 'Shruti', 450),       (42, 'Jubulee', 300),
    (43, 'RC', 130),            (44, 'Akmal', 300),        (45, 'Akash', 230),
    (46, 'Luy', 350),           (47, 'Darin', 250),        (48, 'April', 230),
    (49, 'Ann', 200),           (50, 'Stella', 230),       (51, 'Agnes', 230),
    (52, 'Hikmat', 350),        (53, 'Isabella', 150),     (54, 'Jojo', 150),
    (55, 'Sultan', 300),        (56, 'Simmy', 300),        (57, 'Sahir', 300),
    (58, 'India', 200),         (59, 'Jas', 300),          (60, 'Ren', 100),
    (61, 'Halina', 250),        (62, 'Paula', 200),        (63, 'Charalene', 230),
    (64, 'Cherry', 300),        (65, 'Regina', 300),       (66, 'Farhan', 200),
    (67, 'Joyce', 200),         (68, 'Myra', 200),         (69, 'Charlene', 100),
    (70, 'Lyra', 230),          (71, 'Alma', 200),         (72, 'Jane', 230),
    (73, 'Laxmi', 200),         (74, 'Jmiese', 300),       (75, 'Katherine', 230),
    (76, 'Sweetie', 200),       (77, 'Faisal', 70),        (78, 'Docus', 300),
    (79, 'Iyenayth', 225),      (80, 'Lean', 230),         (81, 'Gremma', 330),
    (82, 'Suzanne', 220),       (83, 'Aisha', 230),        (84, 'Mimi', 230),
    (85, 'Eva', 250),           (86, 'Ratima', 150),       (87, 'Aminah', 90),
    (88, 'Kali', 350)
),
ins as (
  insert into members (name, phone, status, source, notes)
  select name, null, 'active', 'manual', 'July 2026 register #' || k
  from data
  returning id, notes
)
insert into subscriptions (member_id, plan_type, amount, start_date, end_date, paid_via)
select ins.id, '30d', d.amount, date '2026-07-01', date '2026-07-31', 'cash'
from ins
join data d on ins.notes = 'July 2026 register #' || d.k;

-- Check: should be 88 riders and 22215.
select count(*) as riders, sum(s.amount) as total_aed
from members m
join subscriptions s on s.member_id = m.id
where m.notes like 'July 2026 register #%';

-- ---------------------------------------------------------------------------
-- UNDO — only if the import was wrong. Removes exactly what was added above.
-- ---------------------------------------------------------------------------
-- delete from subscriptions
--   where member_id in (select id from members where notes like 'July 2026 register #%');
-- delete from members where notes like 'July 2026 register #%';
