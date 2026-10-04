# CRUVIT Plant Identification — Approved Flow V1

Status: OWNER APPROVED / LOCKED
Approved: 2026-10-04

## Non-negotiable guardrail

Do not redesign or substitute the owner-approved Plant Identification entry screen or the approved core flow without a new explicit owner approval.
Do not change other approved CRUVIT Home / carousel / module designs while implementing this flow.

## Approved core screens

1. **Identify entry**
   - Exact approved visual direction: "Let's identify your plant!"
   - Primary action: Take a photo
   - Secondary action: Choose from gallery
   - Context shortcuts: Plant care tips / Is it right for my garden? / Growing conditions / Save to My Garden
   - CRUVIT bottom navigation remains visible.

2. **Camera**
   - Live camera view
   - Clear plant framing guides
   - Photo capture control
   - Gallery access
   - Minimal chrome; focus stays on plant.

3. **Analyzing**
   - CRUVIT identification in progress
   - Calm visual feedback; no fake certainty
   - Explicitly communicates that the system is finding the best match.

4. **Identification result**
   - Plant identity + common name
   - Confidence shown clearly (mockup example: 95% match)
   - Brief useful description
   - Clear actions: View full profile / Save to My Garden.

5. **Plant profile**
   - Overview as default
   - Tabs / routes for Care and Similar Plants
   - Core biological / descriptive information
   - Avoid information overload.

6. **Care**
   - Light
   - Watering
   - Humidity
   - Temperature
   - Pet safety
   - Fertilizing
   - Information must come from CRUVIT's verified plant data layer; no silent guessing.

7. **Suitability**
   - "Is it right for my garden?"
   - Connect identification to the user's actual garden/location conditions.
   - Show the reasons behind suitability (sun, climate, water, growing conditions).
   - Use CRUVIT climate/recommendation engines rather than a decorative score.

8. **Save to My Garden**
   - Confirmation that the identified plant is being added to My Garden.
   - Location/area, optional note, reminder cadence.
   - CTA: Done / View in My Garden.
   - Creates the bridge from Plant Identification into the My Garden digital twin.

## Interaction sequence

Identify -> Camera/Gallery -> Analyzing -> Result -> Profile / Care / Suitability -> Save to My Garden -> My Garden

## Implementation rule

Build this first as an isolated Plant Identification preview on the Plant-ID UX branch. QA it independently. Only after owner review connect the Plant Identification card/module to the flow. No unrelated visual changes in the same change set.

## Secondary states to mock up separately before implementation

- Camera permission denied
- Image too blurry / plant not centered
- Low-confidence match / multiple likely candidates
- No reliable match
- Offline / service error
- Save conflict / plant already in My Garden

These secondary states are not permission to alter the eight approved core screens.


## Owner approval checkpoint — 2026-10-04

The owner reviewed the primary Plant Identification flow screen-by-screen and approved the visual direction for every core step.

- PI-01 Identify — OWNER APPROVED / LOCKED
- PI-02 Camera — OWNER APPROVED / LOCKED
- PI-03 Analyzing — OWNER APPROVED / LOCKED
- PI-04 Identification Result — OWNER APPROVED / LOCKED
- PI-05 Plant Profile — OWNER APPROVED / LOCKED
- PI-06 Care — OWNER APPROVED / LOCKED
- PI-07 Suitability / Growing Conditions — OWNER APPROVED / LOCKED
- PI-08 Save to My Garden — OWNER APPROVED / LOCKED

Approved secondary content:
- Pet Safety — OWNER APPROVED / LOCKED as a secondary profile screen. It is not inserted as an extra step in the eight-screen core sequence.

### Accuracy guardrail for secondary states

Plant Identification must never silently convert uncertainty into a confident species result. When evidence is insufficient, the UI must explicitly request more evidence, offer likely candidates only as uncertain possibilities, or return no reliable match. Secondary-state design must preserve this behavior.
