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


## CRUVIT approved-screen implementation standard — LOCKED 2026-10-04

This is the implementation method that produced the owner-approved Plant Identification Full-Resolution Flow and must be reused for the remaining CRUVIT screens unless the owner explicitly changes the rule.

### Source-of-truth hierarchy

1. Use the exact owner-approved full-resolution screen asset whenever it exists.
2. If a screen exists only inside an approved multi-screen source image, extract that screen from the highest-resolution approved source available.
3. Never use old thumbnails, compressed preview screenshots, browser screenshots, or previously cropped low-resolution assets as implementation sources.
4. Never rebuild an approved visual in CSS when the approved visual asset itself can be used.
5. Do not regenerate an approved screen with an image model merely to make implementation easier.

### Visual assembly rule

- Preserve the approved pixels.
- Crop only external montage/background margins needed to isolate the approved phone/screen.
- Do not redesign typography, spacing, color, navigation, imagery, card geometry, or phone proportions during implementation.
- Avoid unnecessary resampling. If an extracted approved screen must be normalized for review, use high-quality resampling only and do not alter the design.
- Render one phone/screen only, centered, large, and readable.
- Use the same restrained review-shell principle as the successful Upcoming review: calm green background, no competing viewer UI, no external step counters, no Previous/Next panels, no decorative review chrome.

### Interaction rule

- Interaction is a transparent layer above the approved visual.
- Use invisible hotspots over buttons already drawn in the approved screen.
- Hotspots may change navigation behavior but must not change visible pixels.
- Keep keyboard navigation only as a QA convenience; it must not add visible UI.
- First prove the visual match. Add functional wiring only after the visual source is correct.

### QA gate

Before showing a review file to the owner:
- verify every screen uses the intended approved source;
- verify no low-resolution thumbnail or browser screenshot was substituted;
- verify the phone is centered and readable at desktop width;
- verify there is no extra viewer chrome;
- verify every visible screen matches the approved visual;
- verify hotspots navigate to the intended next screen;
- do not connect the flow to the live application until the isolated review is owner-approved.

### Key lesson from the Plant Identification correction

The successful Full-Resolution Flow was achieved by replacing low-resolution montage-derived LOCKED thumbnails with the best available approved source assets, then using a minimal Upcoming-style HTML shell that only displays the approved screen and overlays transparent interaction hotspots. The visual asset—not reconstructed HTML/CSS—is the source of truth.
