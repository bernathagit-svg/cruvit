# My Garden UI 2.10 — Visual Contract Harness

Status: Phase B / screen 1  
Date: 2026-10-02

## Rule

This directory is not a redesign workspace.

The owner-approved My Garden Home at:

`https://my-garden-photo-tags--frolicking-kitten-996691.netlify.app/`

is the canonical Home visual baseline.

The first Phase B harness mounts that exact approved surface so implementation
work cannot silently drift while the real CRUVIT read models are connected.

## Forbidden in this phase

- visual reinterpretation
- new colors
- new typography
- spacing changes
- card/layout changes
- bottom-navigation changes
- center `+` changes
- replacing the approved garden image
- silently changing labels or hierarchy

## Data sequence

1. Keep approved visual exact.
2. Introduce read-only adapters behind the screen.
3. Replace only hard-coded business values with derived values.
4. Compare against canonical reference.
5. Owner approves.
6. Lock screen.
7. Continue to the next approved screen.

The global bottom navigation remains explicitly deferred.
