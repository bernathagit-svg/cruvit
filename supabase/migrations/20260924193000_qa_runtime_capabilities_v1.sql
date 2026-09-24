-- CRUVIT QA runtime capability gate.
-- Persistent schema only. Capability rows are short-lived operational data and are never committed.

create table if not exists public.qa_runtime_capabilities (
  token_sha256 text primary key check (token_sha256 ~ '^[a-f0-9]{64}$'),
  run_id text not null,
  purpose text not null,
  design_id uuid not null references public.garden_designs(id) on delete cascade,
  source_media_id uuid not null references public.garden_media(id) on delete cascade,
  expires_at timestamptz not null,
  max_reads integer not null default 24 check (max_reads > 0 and max_reads <= 100),
  read_count integer not null default 0 check (read_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.qa_runtime_capabilities enable row level security;
revoke all on table public.qa_runtime_capabilities from anon, authenticated;
grant all on table public.qa_runtime_capabilities to service_role;

comment on table public.qa_runtime_capabilities is
  'Short-lived hashed capabilities for owner-approved internal QA access to private Garden Design source media. No plaintext capability tokens.';
