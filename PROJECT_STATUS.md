# Cruvit Project Status

## Vision

Cruvit is an AI-powered gardening platform that combines:

- Garden Design
- Smart Recommendations
- Plant Doctor
- My Garden (Digital Twin)
- Shop

The goal is to become the world's leading AI gardening platform.

---

# Feature Status

Honest classification from a read-only code verification pass. Tiers:
**Implemented** = working end-to-end · **Partial** = UI/flow present but core logic incomplete · **Placeholder** = entry point exists, capability not yet built.

## Implemented
- Home / Entry screen
- Premium dashboard (My Garden)
- Calendar (v14-style: month nav, notes, day details)
- Notifications (preferences + optional browser notification)
- Health Score (`calculateHealthScore`)
- Add Plant popover (Scan / Manual / Smart Recommendations / Garden Design sources)
- Plant cards
- Smart Recommendations (climate/tag filtering + live profile enrichment)
- Multi-language support (EN/HE, RTL/LTR)
- Mobile support (mobile-first responsive)
- GitHub integration
- Netlify deployment (functions present)

## Partial
- Plant Doctor — plant **identification** and care recommendations work (`plant-identify.mjs`, plant-identifier module, `visual_analysis`); structured **disease detection / diagnosis** is not yet a real flow.
- Shop / Cart — cart add/remove/quantity work; **checkout is a stub** (`checkoutDemo()` shows a "ready for Shopify connection" alert) and there is **no Order flow**.
- Garden photo — hero photo upload works (`scanGarden`); per-plant photo replacement is a stub (`replacePlantPhoto`).

## Placeholder
- Garden Design — only a tag-filtered plant-add source (`addPlantFromDesign`). The `ARCHITECTURE.md` capabilities (photo upload, AI garden redesign, garden styles, plant placement) are **not implemented**.

> Note: tiering reflects code as verified during this audit. Update tiers as modules progress (see Update Rules).

---

# Current Baseline

The approved baseline is:

- My Garden v20-v14-calendar-merged — `TODO(baseline-ref)`: add the commit/tag that pins this baseline.
- v14 Calendar
- v19 Add Plant popover
- Current dashboard layout
- Current mobile UI

These must never be replaced unless explicitly approved. Once a new design is approved in Figma, it becomes the new baseline for that screen (see `AGENTS.md` → "Design source of truth").

---

# Active Development

### Global Plant Catalog Foundation v1b
Status: **Next** — small curated seed catalog / first real plant batch  
Priority: High  
Scope: populate `data/plants.seed.json` with a **small, curated** first batch of global plants (e.g. Coconut, Papaya) — not a huge dump; merge via existing `mergePlantCatalogItems()` when a safe loader lands  
Files involved: `data/plants.seed.json`, `data/plant-catalog.schema.json` (schema done in v1a); optional thin loader later  
Rules: additive only; no UI redesign; preserve approved My Garden baseline; do **not** dump thousands of plants into `index.html`; inline `PLANT_LIBRARY` remains transitional and wins on slug conflicts

**Catalog strategy note:** v1a delivered schema + legacy bridge (`catalogItemToLegacyFlat`, `mergePlantCatalogItems`). Schema prepares for **Environment Suitability** (plant vs location/climate), **Garden Compatibility** (plant vs existing garden plants), **careSchedule / Treatment Calendar**, **multi-state media**, and **future backend/API migration**. Staged approach: **v1a schema + compatibility (done) → v1b curated seed batch → batch enrichment → on-demand missing profiles → backend/database migration**.

---

# Known Issues

_No known issues currently tracked._

<!--
Template for each issue:

### <Short description>
Description: <what happens>
Priority: <High | Medium | Low>
Possible cause: <best guess>
Status: <Open | Investigating | Fixed>
Files: <list of files>
-->

---

# Completed Checkpoints

| Checkpoint | Status | Notes |
|------------|--------|-------|
| **GAS-3A.1** Global Language Control | Done (pushed) | Persistent `#globalAppSettings` language selector on `body` |
| **GAS-2** Global Location Foundation + Control | Done (pushed) | `resolveAppLocation` / `setAppLocation` / `getAppLocation` / location chip + popover |
| **Plant Data Foundation v1** | Done (pushed) | `PlantProfileV1` mapper, `UserPlantV1` fields (`id`, `profileSlug`, `addedAt`), `getPlantProfile()` — commit `cce3b60` |
| **Plant Library Integration v1a** | Done (pushed) | `resolvePlantProfileRaw()` read bridge; `plantMeta()` / `getPlantProfile()` routed — commit `3c70c20` |
| **Climate Suitability Engine v1a** | Done (pushed) | `getGardenClimateProfile()`, `getPlantClimateMetadata()`, `buildClimateSuitabilitySnapshot()` + `window` exports; SR garden read via `getAppClimateProfile()` — commit `a7f6df6` |
| **Climate Suitability Engine v1b** | Done (pushed) | `evaluateClimateSuitabilityV1()` climate-only scoring layer on v1a snapshot; no SR session / UI / persistence — commit `c8a76bc` |
| **Global Plant Catalog Foundation v1a** | Done (pushed) | `data/plants.seed.json` shell, `data/plant-catalog.schema.json` (Environment Suitability + Garden Compatibility extensibility), `catalogItemToLegacyFlat()` / `mergePlantCatalogItems()` legacy bridge; inline `PLANT_LIBRARY` transitional — commit `63b50c4` |

---

# Strategic Principle

**CRUVIT is a Garden Operating System / Digital Twin centered on My Garden.**

Do not build isolated modules or jump to Garden Design redesign too early. The hard-to-copy value is **connected user garden data**:

location · climate · personal plant library · photos · tasks · diagnosis · recommendations · design selections · wishlist · purchases

Every roadmap phase should strengthen that shared garden data layer before expanding module-specific UI.

---

# Future Roadmap

Ordered sequence. Do not skip ahead without explicit approval.

| # | Phase | Status |
|---|-------|--------|
| **0** | **Preserve My Garden Baseline** | Ongoing — approved v20-v14-calendar-merged baseline protected |
| **1** | **Global App Settings** | |
| | ↳ Global Language Control | **Done** |
| | ↳ Global Location Foundation + Control | **Done** |
| **2** | **Plant Data Foundation v1** | **Done** — `PlantProfileV1` / `UserPlantV1` mappers and fields |
| **3** | **Plant Library Integration v1a** | **Done** — `resolvePlantProfileRaw()` read bridge (`3c70c20`) |
| **4** | Climate Suitability Engine v1 | **Done (v1a + v1b)** — snapshot helpers (`a7f6df6`); scoring layer (`c8a76bc`) |
| **5** | Global Plant Catalog Foundation v1 | **In progress** — v1a done (`63b50c4`); **v1b next** (curated seed batch) |
| **6** | Per-user Plant Library v1 | Planned |
| **7** | Shared Plant Picker v1 | Planned |
| **8** | Garden Photo / Media Library Foundation | Planned |
| **9** | Plant Identifier Integration | Planned |
| **10** | Smart Recommendations Integration | Planned |
| **11** | Garden Design Plant Visual Upgrade | Planned |
| **12** | Wishlist as status/filter inside Plant Library | Planned — not a separate duplicate module |
| **13** | Shopify Smart Connection | Planned |
| **14** | Garden Design Studio 2.0 | Planned |
| **15** | AI Garden Coach | Planned |

### Phase notes (brief)

- **4 — Climate Suitability Engine v1:** done through v1b — snapshot helpers (`a7f6df6`) and climate-only `evaluateClimateSuitabilityV1()` (`c8a76bc`) without rewriting SR rules.
- **5 — Global Plant Catalog Foundation v1:** scalable global knowledge base before deep Per-user Plant Library work. **v1a done (`63b50c4`):** `data/plants.seed.json` shell, `data/plant-catalog.schema.json`, legacy bridge helpers; inline `PLANT_LIBRARY` remains transitional. Schema prepares for **Environment Suitability**, **Garden Compatibility**, **careSchedule / Treatment Calendar**, **multi-state media**, and **future backend/API migration**. **v1b next:** small curated seed catalog / first real plant batch — not a huge dump. Then: batch enrichment → on-demand missing profiles → backend/API migration.
- **6 — Per-user Plant Library v1:** user's saved/catalog plants as first-class data; still separate from global catalog mutations.
- **7 — Shared Plant Picker v1:** one picker UX/data path for Add Plant, Smart Rec, Design — after catalog + library foundations are stable.
- **8 — Garden Photo / Media Library:** garden and plant media tied to `data`, not module-local blobs.
- **9–10 — Identifier / Smart Rec integration:** wire modules through shared plant + climate layer; preserve existing detection/scoring quality.
- **11 — Garden Design visual upgrade:** plant visuals only; not full Studio redesign.
- **12 — Wishlist:** filter/status inside Plant Library; no parallel wishlist store.
- **13–15 — Shopify, Design Studio 2.0, AI Coach:** after core garden data graph is connected.

---

# Future Roadmap (priority buckets)

Legacy buckets retained for quick scanning. See numbered roadmap above for execution order.

## High
- Global Plant Catalog Foundation v1b (next — curated seed batch)
- Per-user Plant Library v1
- Shared Plant Picker v1

## Medium
- Garden Photo / Media Library Foundation
- Plant Identifier Integration
- Smart Recommendations Integration
- Garden Design Plant Visual Upgrade
- Wishlist (Plant Library status/filter)

## Low
- Shopify Smart Connection
- Garden Design Studio 2.0
- AI Garden Coach

---

# UI/UX Principles

- Premium
- Natural
- Minimal
- Elegant
- Calm
- Consistent

---

# Figma is the Design Authority

The latest approved Figma design is the single source of truth for UI/UX.

If the current implementation differs from the approved Figma design,
the implementation should be updated to match Figma.

Never invent a new layout when an approved Figma design exists.

---

# Development Workflow

Every feature follows this process:

1. Design in Figma.
2. User approves the design.
3. Analyze the existing implementation.
4. Create a small implementation plan.
5. Implement the approved Figma design.
6. Verify desktop and mobile responsiveness.
7. Report changed files.

When implementing Figma:

- Match spacing precisely.
- Match typography.
- Match colors.
- Match hierarchy.
- Match animations when possible.
- Reuse existing components whenever possible.
- Do not rewrite unrelated code.

---

# Technical Debt

_No technical debt items currently tracked._

---

# External Module Integration

When integrating an external working module, especially a ZIP module:

1. Analyze first.
2. Compare with the current Cruvit architecture.
3. Identify dependencies, data models, APIs, and UI entry points.
4. Identify what should be preserved exactly.
5. Identify what may be adapted.
6. Present an integration plan.
7. Wait for user approval.
8. Only then implement incrementally.

Never rewrite a working external module immediately after importing it.

## Plant Doctor (external module specifics)

- The working ZIP version is the protected source.
- Detection logic, API behavior, result quality, and workflow must be preserved.
- UI/UX may be redesigned later from approved Figma.
- Data integration with the shared Cruvit plant database is allowed only with a safe, additive, reversible plan.

(Canonical process rule lives in `AGENTS.md` → "External module integration rule".)

---

# Next Recommended Task

**Global Plant Catalog Foundation v1b** — add a **small curated seed catalog** / first real plant batch into `data/plants.seed.json` (e.g. Coconut, Papaya and other high-value gaps). Not a huge dump. Use `PlantCatalogItem` v1 shape per `data/plant-catalog.schema.json`; merge via `mergePlantCatalogItems()` when a safe loader is added. Schema already prepares for **Environment Suitability**, **Garden Compatibility**, **careSchedule / Treatment Calendar**, **multi-state media**, and **future backend/API migration**. Inline `PLANT_LIBRARY` in `index.html` stays transitional.

> Always keep exactly ONE recommended next task here.
> When v1b is completed, replace with the next step (v1c loader/enrichment or Per-user Plant Library v1 per roadmap).

---

# Update Rules

Whenever a feature is completed:

Update this document.

Whenever a bug is fixed:

Update this document.

Whenever priorities change:

Update this document.

This file must always represent the current state of the Cruvit project.
