-- CI-only fault injection for atomic Add Plant transaction testing.
-- Never included in migrations and never applied to Production.

create or replace function public.test_force_plant_added_failure_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.event_type = 'plant_added'
     and new.source_module = 'plant_identifier'
     and coalesce(new.payload->>'client_instance_id', '') like 'identifier:force-history-failure%' then
    raise exception 'forced_history_failure';
  end if;
  return new;
end;
$$;

drop trigger if exists test_force_plant_added_failure_v1 on public.garden_events;
create trigger test_force_plant_added_failure_v1
  before insert on public.garden_events
  for each row
  execute function public.test_force_plant_added_failure_v1();
