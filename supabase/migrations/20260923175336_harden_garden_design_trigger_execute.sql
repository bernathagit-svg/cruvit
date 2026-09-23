-- CRUVIT Garden Design trigger execute hardening
-- Live migration version: 20260923175336_harden_garden_design_trigger_execute
-- Trigger-only function must not be callable as an RPC by browser roles.

revoke execute on function public.bump_garden_design_revision_from_placement()
from public, anon, authenticated;
