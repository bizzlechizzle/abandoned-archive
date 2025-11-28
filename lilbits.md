# Lilbits - Script Registry

Canonical registry of scripts and utilities. Each script should be under 300 LOC and serve one focused function.

## Scripts

### `scripts/test-region-gaps.ts`

**Purpose:** Test region gap coverage across all 50 states + DC + territories

**Usage:**
```bash
npx ts-node scripts/test-region-gaps.ts
```

**Description:**
Generates test locations for all 54 states/territories across 5 scenarios:
- Full Data (GPS + Address)
- GPS Only
- Address Only (State + County)
- State Only
- Minimal (Name Only)

Validates that all 8 region fields are populated without gaps. Reports failures with gap field details.

**Lines:** ~259 LOC

**Added:** 2024-11-28 (Region Gap Fix)
