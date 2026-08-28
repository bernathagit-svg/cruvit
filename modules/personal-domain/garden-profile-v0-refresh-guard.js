/**
 * Stale-response guard for owned Garden Profile list refreshes.
 * Pure helper — no DOM, network, or Supabase client.
 *
 * Drop a resolved list if the authenticated user signed out or switched
 * before the response arrived — otherwise a prior user's gardens can flash
 * back into the signed-out or other-user UI.
 */
export function shouldAcceptGardenProfileRefresh(requestUserId, session) {
  const activeId = session?.user?.id;
  return !!(
    requestUserId &&
    activeId &&
    String(activeId) === String(requestUserId)
  );
}
