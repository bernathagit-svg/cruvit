# CRUVIT — Upcoming Final Visual Truth — 2026-10-03

## Owner source of truth
The owner reconfirmed on 2026-10-03 that the following two screens are the exact visual targets for Upcoming.

### List
- File: Upcoming-List-NEW-APPROVED-LOCKED-2026-10-02.png
- SHA-256: 03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430

Locked visible content:
- no Back arrow
- centered My Garden
- camera + notification bell
- Upcoming
- Small steps for a thriving garden.
- Tasks across all your active plants.
- List active / Calendar inactive
- circular Add task
- To do 5 / Completed 2 / All 7
- This week
- exact order:
  1. Water — Lemon — Today · Oct 2
  2. Prune — Lavender — Tomorrow · Oct 3
  3. Fertilize — Agave — Oct 5
  4. Check for pests — Hydrangea — Oct 7
  5. Harvest — Rosemary — Oct 8
- bottom navigation: Home / My Garden active / center + / Design / Shop

### Calendar
- File: Upcoming-Calendar-NEW-APPROVED-LOCKED-2026-10-02.png
- SHA-256: 322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db

Locked visible content:
- Back arrow
- centered My Garden
- camera + notification bell
- Upcoming
- Small steps for a thriving garden.
- no Tasks across all your active plants line
- List inactive / Calendar active
- pill Add task with white circular plus
- October 2026
- Oct 2 selected with three dots
- Oct 5 green task dot
- Oct 7 orange task dot
- Today / Oct 2, 2026 / 3 tasks
- Water — Lemon
- Harvest — Rosemary
- Check for pests — Hydrangea
- same bottom navigation family

## Supersession rule
All earlier Upcoming HTML/reference designs and the pre-redesign Data Consistency Review are superseded for visual matching.
They may be used only for historical/data-contract context, never as the visual source of truth.

## Implementation status
- Review route: /my-garden-ui-2.10/upcoming-review.html
- Visual implementation: in calibration
- Canonical Task projection remains separate from visual-review fixtures
- Status: PENDING OWNER PASS
- Do not mark LOCKED_IMPLEMENTED until explicit owner approval.
- Do not merge this work to main/production yet.

## Remaining known visual gap
The original clean botanical background used in the approved mockup is not available as a standalone repository asset. Do not silently substitute a newly generated background and call it approved.
