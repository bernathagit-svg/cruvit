-- CRUVIT Runtime Cost & Persistence Guardrails V1 — privilege hardening
-- Live migration version: 20260829171035_harden_runtime_cost_persistence_table_privileges
-- Already applied on cruvit-production / saiuscqbszafszpdmzfl. Do NOT re-apply.
--
-- Postgres default grants can leave TRUNCATE / TRIGGER / REFERENCES after a
-- partial REVOKE of INSERT/UPDATE/DELETE. TRUNCATE is not RLS-protected.
-- Harden to exact least privilege for browser roles.

-- catalog_plants: public read-only
revoke all on table public.catalog_plants from anon, authenticated;
grant select on table public.catalog_plants to anon, authenticated;

-- catalog_design_assets: public read-only
revoke all on table public.catalog_design_assets from anon, authenticated;
grant select on table public.catalog_design_assets to anon, authenticated;

-- runtime_cost_events: authenticated SELECT + INSERT only; anon none
revoke all on table public.runtime_cost_events from anon, authenticated;
grant select, insert on table public.runtime_cost_events to authenticated;
