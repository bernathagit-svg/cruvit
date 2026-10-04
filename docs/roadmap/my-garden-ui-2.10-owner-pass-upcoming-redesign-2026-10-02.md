# CRUVIT — Upcoming List + Calendar — New Design Owner PASS

Date: 2026-10-02
Branch: `my-garden-ui-2.10-contract-20261002`
Status: APPROVED_VISUAL / implementation in progress

## Owner decision
The owner explicitly approved the redesigned Upcoming pair.

These references replace the previous Upcoming List / Calendar visual references.

### Upcoming — List
- File: `Upcoming-List-NEW-APPROVED-LOCKED-2026-10-02.png`
- SHA-256: `03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430`

### Upcoming — Calendar
- File: `Upcoming-Calendar-NEW-APPROVED-LOCKED-2026-10-02.png`
- SHA-256: `322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db`

## Locked visual direction
- premium dark botanical CRUVIT visual language
- calmer hierarchy and spacing
- Upcoming title and subtitle
- List / Calendar switch
- Add task
- To do / Completed / All
- plant-aware task rows
- October 2026 calendar structure
- task-day indicators
- selected-day task summary
- My Garden bottom-navigation family

## Data contract
The redesign does not create new data ownership.

Both screens must use:
- the same canonical `garden_tasks` projection
- the same Task IDs
- the same Task dates
- the same Task state
- the same status totals for the same scope

No task copies and no separately authored counts.

## Acceptance state
The visual references are approved and locked.

The active renderer is not `LOCKED_IMPLEMENTED` until:
1. automated identity/count tests pass,
2. implementation preview is visually compared against these references,
3. owner explicitly passes the implementation.

No production writes, schema migration, bottom-nav behavior change, main merge, or production deploy are authorized by this visual PASS.
