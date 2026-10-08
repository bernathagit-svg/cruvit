# CRUVIT — Plant Identification UI 2.10 Flow Contract v1
Date: 2026-10-04
Status: VISUAL DIRECTION LOCKED — PI-01 APPROVED

## Owner-approved PI-01 visual reference
Locked direction:
**Option 4 — Friendly & Visual**

This is the selected and approved visual direction for Plant Identification entry.

Do not replace it with:
- dark botanical/glass redesigns
- dashboard-like layouts
- generic upload cards
- a different visual concept
- a new mockup unless the owner explicitly asks for one

Implementation rule:
**Mockup → owner approval → implementation → wiring.**
For PI-01, the mockup approval is already complete. Implementation must follow the approved Option 4 reference rather than rediscovering the design.

## PI-01 — visual contract
Must preserve the approved composition:
- CRUVIT wordmark centered at the top
- small botanical mark on the left
- help icon on the right
- warm cream/light botanical canvas
- large friendly headline: “Let’s identify your plant!”
- short explanatory subtitle
- prominent real/natural plant scene with leafy framing
- handwritten “Every plant has a story” accent
- dominant green “Take a photo” CTA
- white/cream “Choose from gallery” secondary CTA
- “Need help?” panel
- four visual help cards:
  - Plant care tips
  - Is it right for my garden?
  - Growing conditions
  - Save to My Garden
- bottom navigation:
  - Home
  - My Garden
  - Identify
  - Design
  - Shop
- Identify is the active central navigation item

The phone/device frame in the concept board is presentation framing only. The actual application screen should reproduce the interior UI full-screen.

## Product goal
Bring Plant Identification into CRUVIT without changing the identification engine, canonical identity rules, climate engine, or Add Plant ownership.

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
Visual design is already approved and locked to Option 4 — Friendly & Visual.

No live AI call is connected at visual-review stage.

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

## Information simplification
Do not put all of these on one result screen:
- identification
- full care guide
- full climate analysis
- Add Plant form
- recommendation content

Progressive disclosure:
Identity → resolve uncertainty → climate fit → add decision.

## Acceptance / implementation order
1. PI-01 Option 4 mockup — OWNER APPROVED / LOCKED
2. PI-01 isolated implementation review matching approved mockup
3. PI-02 mockup
4. owner approval
5. PI-02 implementation
6. continue screen-by-screen using the same approval rule
7. integrated E2E visual flow
8. owner PASS
9. only then connect live behavior where explicitly approved

No approved My Garden or other application screen may be visually changed as part of this work.
