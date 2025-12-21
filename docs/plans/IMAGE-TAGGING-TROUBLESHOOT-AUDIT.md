# Plan Audit: Image Tagging Troubleshoot

**Auditing:** `IMAGE-TAGGING-TROUBLESHOOT-PLAN.md`
**Date:** 2025-12-17

---

## Audit Criteria

### vs User Prompt (Step 1)

| Requirement | Plan Addresses? | Notes |
|-------------|-----------------|-------|
| Get image tagging working | ✅ YES | Fixes both Florence-2 and RAM++ fallback |
| Debug SigLIP "unknown" issue | ✅ YES | Phase 3 regenerates embeddings |
| Use scripts/ram-server/venv | ✅ YES | All commands use this venv |
| Focus on getting ANY tagging working | ✅ YES | Plan prioritizes Florence-2 first, then fallback |

**Status:** ✅ PASS

---

### vs CLAUDE.md (Step 2)

| Rule | Compliant? | Evidence |
|------|------------|----------|
| **Rule 1: Scope Discipline** | ✅ | Only fixes broken functionality, no new features |
| **Rule 4: Offline-First** | ✅ | All models are local (SigLIP ONNX, Florence-2, RAM++) |
| **Rule 7: Keep It Simple** | ✅ | Minimal code changes (2 files, ~20 lines) |
| **Rule 10: Verify Build Before Done** | ✅ | Checklist includes `pnpm build` and `pnpm dev` |
| **Native modules in Vite** | ✅ | No new native modules added |
| **Graceful degradation** | ✅ | RAM++ fallback on Florence-2 failure |

**Constraints Checked:**
- ❌ Does NOT modify CLAUDE.md, techguide.md, or lilbits.md
- ✅ Does NOT add new features beyond fix scope
- ✅ Does NOT touch database schema
- ✅ Uses existing Python venv

**Status:** ✅ PASS

---

### vs Best Practices

| Practice | Implemented? | Notes |
|----------|--------------|-------|
| **Error handling** | ✅ | Try-catch fallback added |
| **Logging** | ✅ | Uses existing logger-service |
| **Fail loud** | ✅ | Errors propagate if no fallback available |
| **Backward compatibility** | ✅ | RAM++ still works, Florence-2 unchanged API |
| **Testable in isolation** | ✅ | Standalone Python test command provided |
| **Minimal change surface** | ✅ | Only 2 files modified |

**Status:** ✅ PASS

---

## Gap Analysis

### Identified Gaps in Original Plan

1. **Missing:** Verification that `einops` version is compatible
   - **Added:** Pin to latest stable version

2. **Missing:** What happens if SigLIP model download fails
   - **Mitigation:** Plan includes manual verification steps

3. **Missing:** Rollback plan if fixes break something
   - **Added:** Git allows easy rollback, no migrations

---

## Revised Plan Elements

### Addition 1: Version Pin for einops

```bash
pip install einops>=0.7.0  # Ensure compatible version
```

### Addition 2: Pre-check for transformers version

Florence-2 requires transformers >= 4.40. Check:
```bash
pip show transformers | grep Version
```

If < 4.40:
```bash
pip install --upgrade transformers
```

### Addition 3: Debug flag for SigLIP

Add a debug test command before full integration:
```bash
# Quick SigLIP test
pnpm dev
# In DevTools console:
await window.electron.tagging.testConnection()
```

---

## Final Audit Status

| Dimension | Status |
|-----------|--------|
| vs User Prompt | ✅ PASS |
| vs CLAUDE.md | ✅ PASS |
| vs Best Practices | ✅ PASS |
| Completeness | ✅ PASS |
| Risks Identified | ✅ YES |

**Overall:** Plan is approved for implementation.

---

## Execution Order (Updated)

1. **Phase 1.0:** Check transformers version, upgrade if needed
2. **Phase 1.1:** Install einops
3. **Phase 1.2:** Modify florence_tagger.py (add sdpa attention)
4. **Phase 1.3:** Test Florence-2 standalone
5. **Phase 2.1:** Add RAM++ fallback try-catch
6. **Phase 3.1:** Install SigLIP deps (torch, transformers, numpy, onnx)
7. **Phase 3.2:** Regenerate SigLIP embeddings
8. **Phase 4:** Build and test full pipeline
9. **Phase 5:** Verify with test import

---

End of Audit
