# Audit Cleanup Checklist

**Created**: 2026-01-12
**Status**: Ready for execution
**Source**: January 2026 comprehensive audit

This checklist documents dead code, unused dependencies, and cleanup tasks identified in the audit. Items are organized by priority and safety.

---

## Quick Reference

| Category | Count | Risk Level |
|----------|-------|------------|
| Unused dependencies | 6 packages | Safe to remove |
| Dead code files | 2 files | Safe to remove |
| Deprecated functions | 3 functions | Safe to remove |
| Stub IPC handlers | 65+ | Requires decision |
| Root markdown files | 27 files | Safe to archive |
| Unused config | 2 entries | Safe to remove |

---

## Phase 1: Safe Removals (No Breaking Changes)

### 1.1 Unused Dependencies

**File**: `packages/desktop/package.json`

Remove these packages (never imported):

```bash
pnpm --filter desktop remove puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth node-postal chrono-node
```

| Package | Evidence | Safe? |
|---------|----------|-------|
| `puppeteer-core` | Only in vite.config.ts externals, no imports | Yes |
| `puppeteer-extra` | Only in vite.config.ts externals, no imports | Yes |
| `puppeteer-extra-plugin-stealth` | Only in vite.config.ts externals, no imports | Yes |
| `node-postal` | Zero references in codebase | Yes |
| `chrono-node` | Referenced in comments only (line 4, 315 in date-extraction.ts) | Yes |

**Also remove from vite.config.ts externals** (lines 151-154):
```typescript
// REMOVE these from external array:
'puppeteer-core',
'puppeteer-extra',
'puppeteer-extra-plugin-stealth',
```

- [ ] Remove 5 packages from package.json
- [ ] Remove 3 entries from vite.config.ts externals
- [ ] Run `pnpm install` to update lockfile
- [ ] Verify build still works: `pnpm build`

---

### 1.2 Dead Code Files

#### Duplicate Repository Factory

**Delete**: `packages/desktop/electron/repositories/api-repository-factory.ts`

**Reason**: Duplicate of `unified-repository-factory.ts`. Only `unified-repository-factory.ts` is imported in production code (`main/index.ts`).

**Also delete test**: `packages/desktop/electron/repositories/__tests__/api-repository-factory.test.ts`

- [ ] Delete `api-repository-factory.ts`
- [ ] Delete `api-repository-factory.test.ts`
- [ ] Verify no imports remain: `grep -r "api-repository-factory" packages/`
- [ ] Run tests: `pnpm test`

---

### 1.3 Deprecated Proxy Cleanup Functions (OPT-053)

**File**: `packages/desktop/src/pages/Settings.svelte`

Remove deprecated functions that are now no-ops:

```svelte
// REMOVE these functions (lines ~829-895):
async function purgeOldProxies() { ... }
async function clearAllProxies() { ... }

// REMOVE these state variables:
let purgingProxies = false;
let clearingProxies = false;
let proxyMessage = '';
```

**Also remove from preload** if present:
- `purgeOldProxies`
- `clearAllProxies`

- [ ] Remove `purgeOldProxies()` function from Settings.svelte
- [ ] Remove `clearAllProxies()` function from Settings.svelte
- [ ] Remove state variables: `purgingProxies`, `clearingProxies`, `proxyMessage`
- [ ] Remove any UI buttons that called these (already commented out)
- [ ] Verify no calls remain: `grep -r "purgeOldProxies\|clearAllProxies" packages/`

---

### 1.4 Electron Builder Config Cleanup

**File**: `packages/desktop/electron-builder.config.json`

Remove unnecessary asarUnpack entries (sharp not used by desktop):

```json
// REMOVE from asarUnpack array (lines 14-17):
"node_modules/@img/**/*",
"node_modules/sharp/**/*"
```

- [ ] Remove sharp entries from asarUnpack
- [ ] Verify build still works: `pnpm build`

---

### 1.5 Archive Root Markdown Files

**Target**: Move 27 root-level markdown files to `docs/retired/`

Files to archive (not CLAUDE.md, README.md, DESIGN.md, techguide.md, lilbits.md):

```bash
# Create archive command
mkdir -p docs/retired/2026-01-audit

# Move planning/audit artifacts
mv AU-ARCHIVE-AUDIT-PROMPT.md docs/retired/2026-01-audit/
mv AU-ARCHIVE-IMPLEMENTATION-CHECKLIST.md docs/retired/2026-01-audit/
mv AU-ARCHIVE-MONITORING-STRATEGY.md docs/retired/2026-01-audit/
mv AUDIT_REPORT.md docs/retired/2026-01-audit/
mv DISPATCH-IMPLEMENTATION-GUIDE.md docs/retired/2026-01-audit/
mv DISPATCH-INTEGRATION-PLAN.md docs/retired/2026-01-audit/
mv INTEGRATION_AUDIT_REPORT.md docs/retired/2026-01-audit/
mv MONITORING-INTEGRATION-GUIDE.md docs/retired/2026-01-audit/
mv THIN-CLIENT-GAP-ANALYSIS.md docs/retired/2026-01-audit/
mv DEVELOPER.md docs/retired/2026-01-audit/
mv plan.md docs/retired/2026-01-audit/

# Move v0.1.0 artifacts
mv v010-*.md docs/retired/2026-01-audit/
```

- [ ] Create `docs/retired/2026-01-audit/` directory
- [ ] Move all planning/audit markdown files
- [ ] Move v010-*.md files (8 files)
- [ ] Verify root is clean: only CLAUDE.md, README.md, DESIGN.md, techguide.md, lilbits.md remain
- [ ] Update any internal links if needed

---

## Phase 2: Stub Handler Decisions

### 2.1 Handlers to IMPLEMENT (wire to Hub)

These stubs should call Hub API endpoints:

| Handler | Hub Endpoint | Priority |
|---------|--------------|----------|
| `location:checkDuplicates` | POST `/locations/check-duplicates` | High |
| `location:export` | POST `/locations/:id/export` | High |
| `stats:topStates` | GET `/stats/top-states` | Medium |
| `stats:topCategories` | GET `/stats/top-categories` | Medium |
| `health:getStatus` | GET `/health` | Medium |
| `health:getBackupStats` | GET `/health/backups` | Medium |
| `geocode:reverse` | POST `/geocode/reverse` | Medium |
| `geocode:forward` | POST `/geocode/forward` | Medium |
| `settings:get` | Local config-service | Low |
| `settings:set` | Local config-service | Low |
| `settings:getAll` | Local config-service | Low |

### 2.2 Handlers to REMOVE (no longer needed)

| Handler | Reason |
|---------|--------|
| `location:backfillRegions` | One-time migration, completed |
| `location:updateRegionData` | Replaced by Hub sync |
| `database:backup` | CLI/admin only, not desktop UI |
| `database:restore` | CLI/admin only, not desktop UI |
| `database:wipe` | CLI/admin only, dangerous |
| `database:getLocation` | CLI only |
| `database:changeLocation` | CLI only |
| `database:resetLocation` | CLI only |

**Action**: Remove from preload, keep in CLI if needed.

### 2.3 Handlers to KEEP AS STUBS (acceptable)

| Handler | Reason |
|---------|--------|
| `monitoring:*` | Future feature, document as not implemented |
| `browser:*` (some) | Research browser features, implement later |

---

## Phase 3: Documentation Updates

### 3.1 Update CLAUDE.md Service List

Current CLAUDE.md lists services that don't exist. Update to reflect actual services.

**Current** (outdated):
```
- address-normalizer.ts
- crypto-service.ts
- exiftool-service.ts
```

**Actual services in electron/services/**:
```
- browser-command-service.ts
- config-service.ts
- detached-browser-service.ts
- browser-view-manager.ts
- bookmark-api-server.ts
- websocket-server.ts
- logger-service.ts
- pipeline-tools-updater.ts
- image-downloader/browser-image-capture.ts
```

- [ ] Review if CLAUDE.md should be updated (requires human approval per rules)
- [ ] If approved, update service list to match actual files

### 3.2 Document Preload API Surface

Create documentation of what preload actually exposes vs what's implemented.

- [ ] Create `docs/PRELOAD-API.md` listing all channels
- [ ] Mark status: implemented, stub, removed

---

## Phase 4: Services Package Cleanup

### 4.1 Unused Peer Dependencies

**File**: `packages/services/package.json`

These are listed but never imported in services:

| Package | Status |
|---------|--------|
| `fluent-ffmpeg` | Never imported, Hub worker concern |
| `sharp` | Never imported, Hub worker concern |

**Decision needed**: Remove if services package doesn't need them.

- [ ] Verify no imports: `grep -r "fluent-ffmpeg\|from 'sharp'" packages/services/`
- [ ] If unused, remove from peerDependencies

---

## Verification Checklist

After all cleanup:

- [ ] `pnpm install` completes without errors
- [ ] `pnpm build` completes without errors
- [ ] `pnpm test` passes all tests
- [ ] `pnpm dev` starts without errors
- [ ] App connects to Hub successfully
- [ ] Location CRUD still works
- [ ] Media import still works
- [ ] No console errors in dev tools

---

## Summary of Changes

### Files to Delete
- `packages/desktop/electron/repositories/api-repository-factory.ts`
- `packages/desktop/electron/repositories/__tests__/api-repository-factory.test.ts`

### Dependencies to Remove
- `puppeteer-core`
- `puppeteer-extra`
- `puppeteer-extra-plugin-stealth`
- `node-postal`
- `chrono-node`

### Code to Remove
- `purgeOldProxies()` in Settings.svelte
- `clearAllProxies()` in Settings.svelte
- Related state variables

### Config to Clean
- vite.config.ts externals (3 entries)
- electron-builder.config.json asarUnpack (2 entries)

### Files to Archive
- 27 root markdown files to `docs/retired/2026-01-audit/`

---

## Commit Strategy

Break into atomic commits:

1. `chore(deps): remove unused puppeteer packages`
2. `chore(deps): remove unused node-postal and chrono-node`
3. `refactor: remove duplicate api-repository-factory`
4. `refactor: remove deprecated proxy cleanup functions (OPT-053)`
5. `chore: clean up build config (vite externals, electron-builder)`
6. `docs: archive planning artifacts to docs/retired/`

Each commit should pass build and tests independently.
