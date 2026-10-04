# CRUVIT — Plant Identification UI 2.10 Flow Contract v1
Date: 2026-10-04
Status: DESIGN CONTRACT — NO IMPLEMENTATION REDESIGN APPLIED YET

## Product goal
Bring Plant Identification into the same dark botanical CRUVIT UI 2.10 language without changing the identification engine, canonical identity rules, climate engine, or Add Plant ownership.

## Preserve
- camera / gallery acquisition
- clear-photo guidance
- loading/progress state
- AI identification result
- confidence
- canonical catalog match
- ambiguous-match choice
- no-safe-match state
- climate suitability check
- trusted location context
- survival / growth / flowering / fruiting outcomes
- recent identifications
- explicit Add to My Garden
- language support
- credits awareness
- error/retry states

## Canonical data ownership
Identification attempt/result:
- Plant Identifier session/result

Canonical botanical identity:
- canonical Catalog Plant only after safe match / confirmation

Climate suitability:
- central Climate Suitability Engine
- requires trusted location and confirmed canonical identity

Owned plant:
- NOT created by identification alone
- only explicit Add Plant flow creates one Plant Instance

User image:
- observation/source image belongs to identification attempt
- does not silently become Plant Instance cover

## Screen flow

### PI-01 — Identifier entry
Primary question:
**What do you want to identify?**

Content:
- minimal module identity
- one dominant camera/upload action
- secondary recent identifications
- compact location context
- optional credits context

Remove from current entry:
- marketing-style feature-card overload
- separate light-theme landing-page feel

### PI-02 — Capture / Upload
Primary question:
**Give CRUVIT one useful image.**

Actions:
- Camera
- Gallery
- Retake / replace

Guidance:
- leaf / flower / whole plant
- image quality cue
- supported file feedback

No AI call until explicit Analyze.

### PI-03 — Analyzing
Primary question:
**What is CRUVIT checking?**

Show:
- image thumbnail
- progressive states:
  1. visual identity
  2. catalog match
  3. confidence
  4. climate context only after identity/location rules allow it

No fabricated precision.

### PI-04 — Identification result
Primary question:
**What plant is this, and how sure are we?**

Show:
- user's observation photo
- proposed common/scientific name
- confidence
- canonical catalog match state
- catalog image when confirmed
- concise identity explanation

Do NOT yet overload with full Plant Detail care manual.

### PI-05A — Canonical match confirmed
Actions:
- Check climate fit
- Add to My Garden
- Scan another

Add to My Garden remains explicit.

### PI-05B — Ambiguous match
Primary question:
**Which catalog identity is correct?**

Show:
- bounded candidate set
- distinguishing traits
- confidence / uncertainty
- choose one
- scan another

Do not auto-pick.

### PI-05C — No safe match
Primary question:
**We cannot identify this safely yet.**

Actions:
- Try another photo
- Identify later
- optional manual search

No canonical slug persisted.

### PI-06 — Climate fit
Prerequisites:
- confirmed canonical identity
- trusted location

Show outcome dimensions:
- survival
- vegetative growth
- flowering
- fruiting
- primary limiter
- confidence/provenance cue

This screen reuses the central suitability engine.
It does not create a second climate judgment.

### PI-07 — Add confirmation
Primary question:
**Do you want this plant in My Garden?**

Show:
- confirmed identity
- selected location/area when required
- health state = neutral/unassessed unless actually assessed
- photo choice if product later allows it

Action:
- Confirm and add

Creates:
- one Plant Instance through Add Plant E2E

### PI-08 — Added
Show:
- success
- Open Plant Detail
- Add another / scan another

No duplicate care/task generation outside canonical pipelines.

### PI-09 — Recent identifications
Read-only history of identification attempts/results.

Opening an item must preserve:
- result identity
- original image/provenance
- whether it was added to My Garden
- exact Plant Instance link if one exists

## Error / empty states
Must explicitly design:
- no image
- unsupported image
- read failure
- network failure
- service unavailable
- low confidence
- ambiguous identity
- no catalog match
- untrusted location
- location not found
- climate engine unavailable
- add-to-garden blocked by schema/identity rule

## Visual direction
Use the locked CRUVIT dark botanical language:
- deep garden imagery / living background
- translucent dark glass surfaces
- restrained green accent
- same typography hierarchy as My Garden family
- same app-shell/back/navigation language
- no separate light-theme landing page
- no dashed marketing-card system
- one clear primary action per state

## Information simplification
Do not put all of these on one result screen:
- identification
- full care guide
- full climate analysis
- Add Plant form
- recommendation content

Progressive disclosure:
Identity → resolve uncertainty → climate fit → add decision.

## Acceptance order
1. PI-01 entry
2. PI-02 capture/upload
3. PI-04 result + match states
4. PI-06 climate fit
5. PI-07 add confirmation
6. PI-08 success
7. recent/history + errors
8. integrated E2E visual flow
9. owner PASS
10. implementation

No current Plant Identifier code has been visually redesigned by this document.
