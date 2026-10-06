-- CRUVIT Add Garden Plant Atomic V1
-- Local/CI only until separately approved for Production migration.
-- One transaction: create-once garden_plants + create-once plant_added history.
-- SECURITY INVOKER: caller RLS and grants remain authoritative.

create or replace function public.add_garden_plant_once_v1(
  p_garden_profile_id uuid,
  p_client_instance_id text,
  p_display_name text,
  p_mode text,
  p_profile_slug text,
  p_scientific text,
  p_garden_area_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_instance_id text := trim(coalesce(p_client_instance_id, ''));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_mode text := trim(coalesce(p_mode, ''));
  v_profile_slug text := trim(coalesce(p_profile_slug, ''));
  v_scientific text := trim(coalesce(p_scientific, ''));
  v_plant public.garden_plants%rowtype;
  v_event public.garden_events%rowtype;
  v_created boolean := false;
  v_event_created boolean := false;
  v_event_stable_key text;
  v_client_event_id text;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'auth_required';
  end if;

  if p_garden_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'garden_profile_id_required';
  end if;

  -- Narrow PR #146 scope: only Plant Identification is wired now.
  -- p_mode is part of the shared command signature so future callers can
  -- reuse this command contract after a separately reviewed expansion.
  if v_mode <> 'scan' then
    raise exception using
      errcode = '22023',
      message = 'unsupported_add_plant_mode';
  end if;

  if v_client_instance_id = '' then
    raise exception using
      errcode = '22023',
      message = 'client_instance_id_required';
  end if;
  if char_length(v_client_instance_id) > 160
     or v_client_instance_id !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using
      errcode = '22023',
      message = 'client_instance_id_invalid';
  end if;

  if v_display_name = '' then
    raise exception using
      errcode = '22023',
      message = 'plant_display_name_required';
  end if;
  if char_length(v_display_name) > 160
     or v_display_name ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'plant_display_name_invalid';
  end if;

  if v_profile_slug = '' then
    raise exception using
      errcode = '22023',
      message = 'canonical_slug_required';
  end if;
  if char_length(v_profile_slug) > 160
     or v_profile_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using
      errcode = '22023',
      message = 'canonical_slug_invalid';
  end if;

  if v_scientific = '' then
    raise exception using
      errcode = '22023',
      message = 'scientific_name_required';
  end if;
  if char_length(v_scientific) > 200
     or v_scientific ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'scientific_name_invalid';
  end if;

  -- Explicit ownership preflight. SECURITY INVOKER + table RLS still enforce
  -- the same boundary on every table statement below.
  perform 1
  from public.garden_profiles g
  where g.id = p_garden_profile_id
    and g.user_id = v_user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'garden_not_owned';
  end if;

  -- CREATE ONCE. Never update an existing plant on retry.
  insert into public.garden_plants (
    garden_profile_id,
    client_instance_id,
    name,
    status,
    mark,
    source,
    profile_slug,
    scientific,
    garden_area_id
  ) values (
    p_garden_profile_id,
    v_client_instance_id,
    v_display_name,
    'unassessed',
    'unknown',
    'Scan & Identify',
    v_profile_slug,
    v_scientific,
    p_garden_area_id
  )
  on conflict (garden_profile_id, client_instance_id) do nothing
  returning * into v_plant;

  if found then
    v_created := true;
  else
    -- A conflicting concurrent transaction is resolved by the unique index.
    -- This statement sees the committed authoritative row after the conflict.
    select p.*
      into v_plant
    from public.garden_plants p
    where p.garden_profile_id = p_garden_profile_id
      and p.client_instance_id = v_client_instance_id
    limit 1;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'idempotency_row_unavailable';
    end if;
  end if;

  -- Idempotency payload check: canonical identity only.
  -- Mutable fields (name/status/mark/area) are deliberately ignored.
  if v_plant.profile_slug is not null
     and trim(v_plant.profile_slug) <> v_profile_slug then
    raise exception using
      errcode = '22023',
      message = 'idempotency_payload_mismatch',
      detail = 'existing profile_slug does not match requested canonicalSlug';
  end if;

  -- Deterministic History identity is derived server-side from the
  -- authoritative Plant UUID, never accepted from the client.
  -- UUID is unique and requires no normalization or truncation.
  v_event_stable_key := v_plant.id::text;
  v_client_event_id :=
    'gev_plant_identifier_plant_added_' || v_event_stable_key;

  -- History payload is also derived only from the authoritative Plant row.
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'name', v_plant.name,
    'scientific', v_plant.scientific,
    'profile_slug', v_plant.profile_slug,
    'origin_source', v_plant.source,
    'client_instance_id', v_plant.client_instance_id
  ));

  insert into public.garden_events (
    garden_profile_id,
    garden_plant_id,
    schema_version,
    event_type,
    source_module,
    client_event_id,
    payload,
    occurred_at
  ) values (
    v_plant.garden_profile_id,
    v_plant.id,
    1,
    'plant_added',
    'plant_identifier',
    v_client_event_id,
    v_payload,
    coalesce(v_plant.added_at, now())
  )
  on conflict (garden_profile_id, client_event_id) do nothing
  returning * into v_event;

  if found then
    v_event_created := true;
  else
    select e.*
      into v_event
    from public.garden_events e
    where e.garden_profile_id = v_plant.garden_profile_id
      and e.client_event_id = v_client_event_id
    limit 1;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'plant_added_event_unavailable';
    end if;

    if v_event.garden_plant_id is distinct from v_plant.id
       or v_event.event_type <> 'plant_added'
       or v_event.source_module <> 'plant_identifier' then
      raise exception using
        errcode = '22023',
        message = 'idempotency_history_mismatch';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'historyCreated', v_event_created,
    'plant', jsonb_build_object(
      'id', v_plant.id,
      'garden_profile_id', v_plant.garden_profile_id,
      'user_id', v_plant.user_id,
      'client_instance_id', v_plant.client_instance_id,
      'name', v_plant.name,
      'status', v_plant.status,
      'mark', v_plant.mark,
      'source', v_plant.source,
      'profile_slug', v_plant.profile_slug,
      'scientific', v_plant.scientific,
      'archived', v_plant.archived,
      'prefs', v_plant.prefs,
      'added_at', v_plant.added_at,
      'garden_area_id', v_plant.garden_area_id,
      'created_at', v_plant.created_at,
      'updated_at', v_plant.updated_at
    ),
    'history', jsonb_build_object(
      'id', v_event.id,
      'client_event_id', v_event.client_event_id,
      'garden_plant_id', v_event.garden_plant_id,
      'event_type', v_event.event_type,
      'source_module', v_event.source_module
    )
  );
end;
$$;

revoke execute on function public.add_garden_plant_once_v1(
  uuid, text, text, text, text, text, uuid
) from public;

revoke execute on function public.add_garden_plant_once_v1(
  uuid, text, text, text, text, text, uuid
) from anon;

grant execute on function public.add_garden_plant_once_v1(
  uuid, text, text, text, text, text, uuid
) to authenticated;

comment on function public.add_garden_plant_once_v1(
  uuid, text, text, text, text, text, uuid
) is
  'Atomic create-once Add Plant command. SECURITY INVOKER. Creates or returns one authoritative garden_plants row and guarantees one plant_added garden_events row in the same transaction.';
