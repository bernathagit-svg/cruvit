-- CRUVIT My Garden plant health unknown/unassessed support V2
-- Additive compatibility migration for Plant Identification -> My Garden.
-- Existing plant rows and existing free-form status values are preserved unchanged.

alter table public.garden_plants
  alter column status set default 'unassessed';

alter table public.garden_plants
  alter column mark set default 'unknown';

alter table public.garden_plants
  drop constraint if exists garden_plants_mark_chk;

alter table public.garden_plants
  add constraint garden_plants_mark_chk
  check (mark in ('unknown', '✓', '!'));

comment on column public.garden_plants.status is
  'Plant instance status text. New plants default to unassessed; existing care/status text remains valid.';

comment on column public.garden_plants.mark is
  'Compact health indicator. unknown for unassessed plants, ✓ for healthy, ! for attention/risk.';
