# CRUVIT — My Garden Task Lifecycle Schema Proposal v1
Date: 2026-10-02
Status: PROPOSAL ONLY — NOT APPLIED
Owner checkpoint required before migration

## Why this exists

Current `garden_tasks` already provides a durable Task identity and has:
- `id`
- `garden_profile_id`
- `garden_plant_id`
- `due_on`
- `done`
- provenance fields

But it does not durably represent cancellation, and it does not store a trustworthy completion timestamp.

The approved My Garden UI needs:
- pending
- completed
- cancelled
- exact cross-view consistency

without creating a second Task store.

## Safety principle

Do not fabricate historical timestamps.

Existing rows with `done = true` are known to be completed, but unless there is a trustworthy event/timestamp source, the exact completion time is **unknown**.

Do not backfill `completed_at` from `updated_at` merely because it is convenient.

## Additive migration proposal

Add to `public.garden_tasks`:

```sql
completed_at timestamptz null,
cancelled_at timestamptz null
```

Optional later field, only if product requirements justify it:

```sql
cancellation_reason text null
```

Do NOT add a separate task-status table.

## Authoritative read rule

During compatibility phase:

```text
if cancelled_at is not null -> cancelled
else if done = true          -> completed
else                         -> pending
```

This preserves old rows and old clients.

## Consistency constraints

New schema should prevent impossible states:

1. a task cannot be both completed and cancelled
2. if `cancelled_at` is set, `done` must be false
3. if `completed_at` is set, `done` must be true

Legacy `done = true AND completed_at IS NULL` remains valid because historical completion time may genuinely be unknown.

## New write contract

### Complete task
Atomic logical operation:
1. verify task belongs to current garden / plant
2. verify it is not cancelled
3. set:
   - `done = true`
   - `completed_at = now()` (or trusted user-performed time if product explicitly supports it)
4. append one `garden_events` row:
   - `event_type = task_completed`
   - `garden_task_id = task.id`
   - `garden_plant_id = task.garden_plant_id`
5. read back the Task and Event
6. all UI views update from the same Task ID

### Cancel task
Atomic logical operation:
1. verify task belongs to current garden / plant
2. verify it is not completed
3. set:
   - `done = false`
   - `cancelled_at = now()`
4. append one `garden_events` row:
   - `event_type = task_cancelled`
5. read back
6. same Task disappears from pending/attention views and appears in cancelled history where relevant

## Idempotency

Task lifecycle writes must be retry-safe.

Use `garden_events.client_event_id` for event idempotency.

The Task mutation itself must also reject conflicting transitions rather than silently overwrite them.

Examples:
- completing an already-completed task -> return existing completed state
- cancelling an already-cancelled task -> return existing cancelled state
- cancelling a completed task -> explicit conflict
- completing a cancelled task -> explicit conflict unless a future explicit reopen flow exists

## No silent state inference

The UI must never infer:
- cancellation from disappearance
- completion from date passing
- completion timestamp from `updated_at`
- health outcome from task completion

`task_completed` is not proof that treatment succeeded.

## Compatibility

Existing `done` remains in place during this phase.

This avoids breaking:
- current app readers
- existing task queries
- older deployed clients

A future Task State V2 may replace `done` with a first-class state field only after all clients migrate.

## Required tests before applying

1. legacy pending row remains pending
2. legacy `done=true` row is completed with unknown completion timestamp
3. new completion sets both `done=true` and `completed_at`
4. new cancellation sets `cancelled_at` and keeps `done=false`
5. impossible complete+cancel state is rejected
6. duplicate retry does not create duplicate event
7. cross-garden task mutation is rejected
8. archived-plant behavior follows explicit product rule
9. Schedule / Upcoming / Calendar / Attention / Notifications all reflect one transition
10. Plant History / Garden Journal read the same lifecycle event ID

## Owner checkpoint

Before applying:
- review exact SQL
- review existing live data distribution
- verify no client depends on `done` alone in a way that conflicts with cancellation
- run migration in non-production / preview environment
- run readback + regression gates

No production migration is authorized by this document.