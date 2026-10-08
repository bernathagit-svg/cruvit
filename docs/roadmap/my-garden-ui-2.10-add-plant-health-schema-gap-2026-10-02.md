# My Garden UI 2.10 — Add Plant health-state schema gap
Date: 2026-10-02
Status: BLOCKER FOR LIVE ADD-PLANT WRITE
No migration applied.

## Approved Add Plant visual remains unchanged

The approved screen includes:
- Scan plant
- Add manually
- Get suggestions
- Search plants
- Popular for your area

This checkpoint changes no UI.

## Backend conflict

Current public.garden_plants defines:

- status text NOT NULL default 'Healthy'
- mark text NOT NULL default '✓'
- mark CHECK allows only '✓' or '!'

For a newly added plant, CRUVIT frequently does not yet have a verified health assessment.

Persisting the schema defaults would silently turn:
"health not assessed"
into:
"Healthy ✓"

That violates CRUVIT's no-silent-inference rule.

## Required resolution before live Add Plant

The production schema must support a truthful neutral state.

Candidate additive path for later owner review:
- change status default from 'Healthy' to 'Not assessed' (or contract equivalent)
- allow a neutral mark state (nullable or explicit '?'/neutral enum-vocabulary)
- backfill must NOT rewrite existing real health assessments
- old clients must be checked before changing defaults/constraints

Exact SQL must be reviewed separately.

## Identity rules

### Manual
User label only.
No canonical slug/scientific name is assigned unless the user later confirms identity.

### Scan
Canonical identity may be persisted only after identifier confirmation.
Unconfirmed scan remains unverified.

### Search / Popular / Suggestions
The chosen canonical catalog identity may populate profile_slug/scientific.

## No side effects

Creating a Plant Instance must not silently:
- mark it healthy
- create completed care records
- create history duplicates
- create recommendations as accepted
- create tasks unless a separate task-generation contract explicitly does so

No live insert is authorized by this checkpoint.
