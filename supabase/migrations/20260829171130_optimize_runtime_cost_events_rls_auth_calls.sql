-- CRUVIT Runtime Cost & Persistence Guardrails V1 — RLS auth initplan optimize
-- Live migration version: 20260829171130_optimize_runtime_cost_events_rls_auth_calls
-- Already applied on cruvit-production / saiuscqbszafszpdmzfl. Do NOT re-apply.
--
-- Replace per-row auth.uid() with (select auth.uid()) to avoid auth_rls_initplan
-- performance warnings. Semantics unchanged: own-row SELECT / INSERT only.

drop policy if exists runtime_cost_events_select_own on public.runtime_cost_events;
create policy runtime_cost_events_select_own
  on public.runtime_cost_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists runtime_cost_events_insert_own on public.runtime_cost_events;
create policy runtime_cost_events_insert_own
  on public.runtime_cost_events
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and trigger_kind in ('user', 'system')
  );
