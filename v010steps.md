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

**Pop-up Import Form**
- On Squarespace, forms can be implemented as pop-ups
- [ ] Investigate implementing the import form as a pop-up/modal
- [ ] Could be reused across multiple pages for easy access
- [ ] Benefits:
  - Quick access from any page
  - Consistent experience
  - Doesn't require page navigation

---

## Questions to Explore

1. What triggers should open the pop-up form? (Button, keyboard shortcut, etc.)
2. Which pages should have access to the pop-up form?
3. Should the pop-up form have all fields or a simplified version?
4. Data migration strategy for removing Condition/Status fields?

---

## Next Steps

_To be determined after brainstorming session_
