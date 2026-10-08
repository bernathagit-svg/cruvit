# CRUVIT — My Garden Information Duplication Audit v1
Date: 2026-10-04
Status: AUDIT / NO VISUAL CHANGES AUTHORIZED

## Purpose
Reduce cognitive load without deleting useful information and without breaking approved visual locks.

This document does not redesign any approved screen.

## Core rule
The same underlying data may appear in more than one screen only when the **user question is different**.

Same data source is good.
Repeated information with no new purpose is not.

---

## Screen ownership

### My Garden Home
User question:
**What is happening in my garden right now, and where should I go next?**

Owns presentation of:
- garden identity/photo
- high-level active plant count
- high-level upcoming count
- high-level attention count
- one/few priority attention items
- entry points to major My Garden flows

Must not become:
- task list
- plant catalog
- journal
- detailed care screen
- notification center

### My Plants
User question:
**What plants do I currently have?**

Owns presentation of:
- Plant Instance identity
- personal/system photo
- short current status
- garden area / position cue
- lightweight filtering/search
- direct entry to Plant Detail

Must not repeat:
- full care instructions
- full task schedule
- history timeline
- long climate explanation

### Plant Detail → Overview
User question:
**What is this exact plant, what is its current state, and what matters now?**

Owns:
- identity
- current health/state when verified
- exact location
- current season / phenology summary
- concise current highlights
- key dimensions/traits relevant to this instance
- entry actions

Must not duplicate:
- full evergreen care manual
- detailed task calendar
- full event history

### Plant Detail → Care
User question:
**How should I care for this plant?**

Owns:
- evergreen care guidance
- garden-adapted guidance
- climate/location-specific caveats
- watering/light/soil/fertilizing/pruning/etc.
- warnings/safety
- concise link to next actionable Task when one exists

Boundary:
Care guidance is knowledge.
A dated action is a Task.

### Plant Detail → Schedule
User question:
**What do I need to do for this plant, and when?**

Owns:
- dated Tasks for this Plant Instance
- task state
- task lifecycle actions

Must not repeat:
- full care prose
- garden-wide tasks

### Plant Detail → History
User question:
**What has happened to this plant?**

Owns:
- Events for this exact Plant Instance
- notes/care/photos/health/task lifecycle events

### Upcoming → List
User question:
**What do I need to do across my whole garden?**

Owns:
- cross-garden Task queue
- status scopes (to do / completed / all)
- plant context per Task

### Upcoming → Calendar
User question:
**When are my garden Tasks happening?**

Owns:
- same canonical Tasks, calendar projection
- selected-day summary

No separate calendar-task data.

### Garden Journal
User question:
**What has happened across my whole garden?**

Owns:
- garden-wide Event timeline
- filters by plant/type/scope

Same Event identity as Plant History.

### Notifications
User question:
**What specifically needs my attention now?**

Owns:
- due / overdue / attention projection
- only Tasks that meet notification conditions
- direct action or jump to source context

Must not become:
- a second Upcoming list
- a second task database

### Add Plant
User question:
**How do I add a new Plant Instance?**

Owns:
- acquisition path
- scan/manual/recommendation/design entry routes
- explicit identity confirmation
- explicit add decision

Must not duplicate:
- Plant Detail after creation
- recommendation logic
- Identifier logic

---

## Duplication classifications

### GOOD / intentional multi-view projection
Keep:
- same Task in Schedule, Upcoming, Calendar and Notifications
- same Event in Plant History and Garden Journal
- same Plant Instance identity/photo in My Plants and Plant Detail
- high-level counts on Home that link to detailed screens

Reason:
Each view answers a different user question.

### WATCH — likely cognitive duplication
Review before final UI lock:

1. **Overview ↔ Care**
   - season/current-condition guidance can drift into full care instructions
   - keep Overview concise and current; Care complete and instructional

2. **Home ↔ Notifications**
   - Home attention should be a compact priority preview only
   - Notifications owns the complete attention list

3. **Home ↔ Upcoming**
   - Home upcoming should be count + small preview
   - Upcoming owns the full queue

4. **Notifications summary boxes ↔ filter chips**
   - counts may appear twice on the same screen
   - acceptable if one is dashboard summary and one is interactive filter
   - candidate for simplification only after owner mockup review

5. **My Plants status ↔ Overview status**
   - concise status on card is useful
   - detailed evidence/context belongs in Overview
   - never duplicate long explanation on cards

6. **Schedule ↔ Care “next action”**
   - Care may reference the next Task
   - Schedule owns date/state/edit lifecycle

### REMOVE / prohibit conceptually
Do not create:
- duplicated Task stores per screen
- copied notification records that recreate Task truth
- separate Journal history truth
- separate Plant object per module
- separate personal photo state for My Plants vs Plant Detail
- recommendation accepted state silently becoming owned plant
- Garden Design placement silently becoming Plant Instance

---

## Proposed simplification principle
Before adding any visible block ask:

**Does this answer the primary question of this screen?**

If not:
- move it to the owning screen
- show a one-line summary/link if context is useful
- do not duplicate the full block

---

## No-change checkpoint
No approved visual has been changed by this audit.

Any visual simplification of an approved screen requires:
1. one isolated proposed change
2. mockup/preview
3. owner approval
4. implementation
5. visual regression check
