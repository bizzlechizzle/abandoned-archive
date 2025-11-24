# v0.10 Launch Cleanup Steps

## Brainstorming Document

This document outlines the next cleanup steps to get us closer to launch.

---

## App Improvements / Bug Fixes

### Imports Page

#### Mandatory Fields

**Location Name**
- Used for folders, needed to generate short name
- [ ] Update label from "Location Name" to "Name"

**Type**
- Used for folders, needed for state-type folder structure

**State**
- Used for folders, needed for state-type folder structure

---

#### Document Field Updates

**Access Status** (Consolidate/Replace Condition & Status)
- Abandoned
- Demolished
- Active
- Partially Active
- Future Classic
- Vacant
- Unknown

**Remove "Condition" and "Status" Fields**
- [ ] Not needed in the database
- [ ] Scrub existing data
- [ ] Remove from UI/forms
- [ ] Remove from database schema

---

### UI/UX Improvements

**Pop-up Import Form** ✓ CONFIRMED
- Implement import form as a modal/dialog component
- Available globally across all pages
- [ ] Wrap import form in modal component
- [ ] Add trigger button in header/nav ("+ Add Location")
- [ ] Consider floating action button (FAB) option
- [ ] Optional: keyboard shortcut (e.g., `Ctrl+I` or `N`)

**Benefits:**
- No page navigation needed
- Quick access from browse, dashboard, anywhere
- Consistent experience
- Form state can be preserved if accidentally closed

**Open Questions:**
- Full form or simplified "quick add" version?
- Post-submit behavior: close modal, show success, navigate to record?

---

## Questions to Explore

1. Data migration strategy for removing Condition/Status fields?

---

## Next Steps

_To be determined after brainstorming session_
