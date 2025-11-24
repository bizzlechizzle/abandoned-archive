# v0.10 Launch Cleanup Steps

## Brainstorming Document

This document outlines the next cleanup steps to get us closer to launch.

---

## App Improvements / Bug Fixes

### Import Pop-up (Replaces Imports Page)

**[ ] Remove dedicated /imports page** - replaced by global pop-up

#### Mandatory Fields

**Location Name**
- Used for folders, needed to generate short name
- [ ] Update label from "Location Name" to "Name"

**Type**
- Used for folders, needed for state-type folder structure

**State**
- Used for folders, needed for state-type folder structure

#### State/Type Field Dependencies

**[ ] Type depends on State**
- Type dropdown only shows options available for the selected State
- Filter Type options based on current State selection

**[ ] Smart defaults on change**
- If State changes → default Type to "all" if current Type has no results in new State
- If Type changes → default State to "all" if current Type has no results in current State

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
- Available globally - anywhere, anytime
- [ ] Wrap import form in modal component
- [ ] Add trigger button in header/nav ("+ Add Location")
- [ ] Consider floating action button (FAB) option
- [ ] Optional: keyboard shortcut (e.g., `Ctrl+I` or `N`)

**Pop-up Form Fields (Step 1 - Quick Add):**
- Name
- Type
- State
- Author
- Documentation Level
- Access Status

**Step 2 - Details (on Location Edit/Detail Page):**
- GPS coordinates
- Location details
- After pop-up submit, user can navigate to location page to add details

**Benefits:**
- No page navigation needed
- Quick access from browse, dashboard, anywhere
- Consistent experience
- Streamlined entry - essential fields first, details later

---

### General App

**[ ] Remove Darktable Completely**
- Remove darktable and any mention of it from scripts, install, etc.
- Remove "Darktable RAW Processing" section
- Remove "Darktable CLI Not Found" message
- Remove "Install Darktable for premium RAW processing: darktable.org/install"
- Not using this app

**[ ] Navigation: Move Atlas to top**
- Move Atlas to the top option in navigation
- Still default to Dashboard page on app load

---

### Browser

**Bug: abandonedupstate.com fails in internal browser**
- [ ] Investigate why abandonedupstate.com fails on internal browser but works on real internet

**[ ] Rename "Save Bookmark To" → "Save Bookmark"**

**Bug: Save Bookmark → Recents not autofilling**
- [ ] Why isn't this autofilling the last 5 recent locations?

**[ ] Remove "Recent Uploads"**
- Not needed - just need recent locations

**Bookmarks Browser**
- [ ] Should each state and type be pre-filled in the database?

---

### Current Page

**[ ] Add "New Location" button**
- Opens the new pop-up locations import form

---

### Atlas

**[ ] Change pin colors to accent color**

**[ ] Mini location pop-up on pin click**
- Show mini pop-up instead of going direct to location page
- Preview info before navigating

**[ ] Add additional map layers to Leaflet**
- Add all available free/open source map layers
- Layer switcher for users to choose preferred style

**Bug: Right-clicking map freezes it**
- [ ] Troubleshoot freeze issue
- [ ] Should show a pop-up context bar instead

**Right-click Pop-up Bar Options:**
- Add to map
- Copy GPS

---

### Dashboard

**[ ] Remove "Special Filters" - Map View**
- Feature is redundant

---

### Location Page

**[ ] Remove "Source: geocoded_address"**

**[ ] Fix "Approximate location" message logic**
- Current: "Approximate location - Based on state center. Click map to set exact location."
- Problem: Shows even when location has real GPS coordinates
- [ ] Implement smart hierarchy - only show approximate message when GPS is actually missing/defaulted

**Location Box should contain:**
- Address
- GPS
- Map

---

## Questions to Explore

1. Data migration strategy for removing Condition/Status fields?

---

## Next Steps

_To be determined after brainstorming session_
